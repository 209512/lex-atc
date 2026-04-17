const Redis = require('ioredis');
const logger = require('../utils/logger');

class SSEService {
    constructor(svc, cfg) {
        this.svc = svc;
        this.cfg = cfg;
        this.sseClients = new Set();
        this.MAX_SSE_CLIENTS = 100;
        this.redisSub = null;
        this.redisPub = null;
        this.ssePingInterval = null;
        this.isPublishing = false;
        this.pendingPublish = false;
        this.lastSentLogId = null;
        this.lastWire = null;
        this._lastRedisErrorAt = 0;
        this.publisherId = `${process.pid}:${Math.random().toString(36).slice(2)}`;
        this.isLeader = false;
        this.leaderInterval = null;
        
        this.publishState = this.publishState.bind(this);
    }
    
    init() {
        if (process.env.REDIS_URL || process.env.REDIS_SENTINELS) {
            const opts = { maxRetriesPerRequest: null, enableReadyCheck: false, retryStrategy(times) { return Math.min(times * 50, 2000); } };
            if (process.env.REDIS_SENTINELS) {
                const sentinels = process.env.REDIS_SENTINELS.split(',').map(s => {
                    const [host, port] = s.split(':');
                    return { host, port: parseInt(port, 10) };
                });
                opts.sentinels = sentinels;
                opts.name = process.env.REDIS_SENTINEL_NAME || 'mymaster';
                opts.password = process.env.REDIS_PASSWORD || undefined;
                this.redisSub = new Redis(opts);
                this.redisPub = new Redis(opts);
            } else {
                this.redisSub = new Redis(process.env.REDIS_URL, opts);
                this.redisPub = new Redis(process.env.REDIS_URL, opts);
            }
            
            this.redisSub.on('error', (err) => {
                const now = Date.now();
                if (now - this._lastRedisErrorAt > 5000) {
                    this._lastRedisErrorAt = now;
                    logger.warn('[SSE Redis] Sub error:', err.message);
                }
            });
            this.redisPub.on('error', (err) => {
                const now = Date.now();
                if (now - this._lastRedisErrorAt > 5000) {
                    this._lastRedisErrorAt = now;
                    logger.warn('[SSE Redis] Pub error:', err.message);
                }
            });

            this.redisSub.subscribe('atc:sse:state', (err) => {
                if (err) logger.error('[SSE Redis] Subscribe error:', err.message);
                else logger.info('[SSE Redis] Subscribed to atc:sse:state');
            });
            
            this.redisSub.on('message', (channel, message) => {
                if (channel === 'atc:sse:state') {
                    this.lastWire = message;
                    this.broadcastSSE(message);
                }
            });

            this._renewLeader().catch(() => {});
            this.leaderInterval = setInterval(() => {
                this._renewLeader().catch(() => {});
            }, 1000);
            if (this.leaderInterval.unref) this.leaderInterval.unref();
        }

        this.ssePingInterval = setInterval(() => {
            if (this.sseClients.size === 0) return;
            const ping = `:\n\n`; // SSE comment serves as keep-alive
            for (const res of this.sseClients) {
                res.write(ping);
            }
        }, 30000);
        if (this.ssePingInterval.unref) this.ssePingInterval.unref();

        if (typeof this.svc.on === 'function') {
            this.svc.removeAllListeners('state');
            this.svc.on('state', this.publishState);
        }
    }

    broadcastSSE(dataStr) {
        for (const res of this.sseClients) {
            res.write(dataStr);
        }
    }

    async _renewLeader() {
        if (!this.redisPub || this.redisPub.status !== 'ready') {
            this.isLeader = true;
            return;
        }
        const key = 'atc:sse:publisher';
        const ttlMs = 4000;
        try {
            if (this.isLeader) {
                const res = await this.redisPub.set(key, this.publisherId, 'PX', ttlMs, 'XX');
                if (res !== 'OK') this.isLeader = false;
                return;
            }
            const res = await this.redisPub.set(key, this.publisherId, 'PX', ttlMs, 'NX');
            if (res === 'OK') this.isLeader = true;
        } catch {
            this.isLeader = true;
        }
    }

    _buildWirePayload({ agents, state, eventId }) {
        const dataStr = JSON.stringify({ agents, state });
        const id = eventId || '0';
        return `id: ${id}\ndata: ${dataStr}\n\n`;
    }

    _logsSince(lastEventId) {
        const allLogs = this.svc.state.logs || [];
        if (!lastEventId) return allLogs.slice(-100);
        const lastIdx = allLogs.findIndex(l => String(l.id) === String(lastEventId));
        if (lastIdx !== -1) return allLogs.slice(lastIdx + 1);
        return allLogs.slice(-100);
    }

    async publishState() {
        if ((process.env.REDIS_URL || process.env.REDIS_SENTINELS) && !this.isLeader) return;
        if (this.isPublishing) {
            this.pendingPublish = true;
            return;
        }
        this.isPublishing = true;
        try {
            const agents = await this.svc.getAgentStatus();
            if (agents.length === 0 && this.svc.activeAgentCount > 0) {
                this.isPublishing = false;
                return;
            }
            
            const allLogs = this.svc.state.logs || [];
            let newLogs = [];
            if (!this.lastSentLogId) {
                newLogs = allLogs;
            } else {
                const lastIdx = allLogs.findIndex(l => l.id === this.lastSentLogId);
                if (lastIdx !== -1) {
                    newLogs = allLogs.slice(lastIdx + 1);
                } else {
                    newLogs = allLogs.slice(-100);
                }
            }

            if (newLogs.length > 0) {
                this.lastSentLogId = newLogs[newLogs.length - 1].id;
            }

            const data = {
                state: {
                    ...this.svc.state,
                    contractVersion: 1,
                    sse: { serverTime: Date.now() },
                    logs: newLogs
                },
                agents: agents
            };
            const eventId = this.lastSentLogId || `t-${Date.now()}`;
            const wire = this._buildWirePayload({ agents: data.agents, state: data.state, eventId });
            this.lastWire = wire;
            
            if (this.redisPub && this.redisPub.status === 'ready') {
                this.redisPub.publish('atc:sse:state', wire);
            } else {
                this.broadcastSSE(wire);
            }
        } catch (err) {
            logger.error("[SSE] Publish error:", err);
        } finally {
            const timeoutId = setTimeout(() => {
                this.isPublishing = false;
                if (this.pendingPublish) {
                    this.pendingPublish = false;
                    this.publishState();
                }
            }, 100);
            if (timeoutId.unref) timeoutId.unref();
        }
    }

    attachRoute(app, middlewares = {}) {
        const { authStream } = middlewares;
        const chain = [];
        if (typeof authStream === 'function') chain.push(authStream);
        chain.push(async (req, res, next) => {
            try {
                if (this.sseClients.size >= this.MAX_SSE_CLIENTS) {
                    return res.status(503).json({ error: 'TOO_MANY_CONNECTIONS' });
                }

                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.flushHeaders();

                this.sseClients.add(res);

                const lastEventId = String(req.headers['last-event-id'] || '');
                const agents = await this.svc.getAgentStatus();
                const logs = this._logsSince(lastEventId);
                const state = {
                    ...this.svc.state,
                    contractVersion: 1,
                    sse: { serverTime: Date.now() },
                    logs
                };
                const eventId = (logs.length > 0 ? logs[logs.length - 1].id : (this.lastSentLogId || `t-${Date.now()}`));
                const wire = this._buildWirePayload({ agents, state, eventId });
                this.lastWire = wire;
                res.write(wire);

                req.on('close', () => {
                    this.sseClients.delete(res);
                });
            } catch (err) {
                next(err);
            }
        });
        app.get('/api/stream', ...chain);
    }

    shutdown() {
        if (this.ssePingInterval) clearInterval(this.ssePingInterval);
        if (this.leaderInterval) clearInterval(this.leaderInterval);
        if (this.redisSub) this.redisSub.disconnect();
        if (this.redisPub) this.redisPub.disconnect();
        for (const res of this.sseClients) {
            res.end();
        }
        this.sseClients.clear();
    }
}

module.exports = SSEService;
