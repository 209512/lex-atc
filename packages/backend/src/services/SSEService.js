const logger = require('../utils/logger');
const promClient = require('prom-client');
const { initRedis, shutdownRedis } = require('./sse/redis');
const { renewLeader } = require('./sse/leader');
const { buildWirePayload } = require('./sse/payload');
const handleStream = require('./sse/route');

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
        this.contractViolations = null;
        
        this.publishState = this.publishState.bind(this);
    }
    
    init() {
        const existing = promClient.register.getSingleMetric('lex_atc_contract_validation_failures_total');
        this.contractViolations = existing || new promClient.Counter({
            name: 'lex_atc_contract_validation_failures_total',
            help: 'Count of contract validation failures',
            labelNames: ['channel', 'schema', 'mode']
        });

        initRedis(this);
        if (this.redisSub || this.redisPub) {
            renewLeader(this).catch(() => {});
            this.leaderInterval = setInterval(() => {
                renewLeader(this).catch(() => {});
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

    async publishState() {
        if ((process.env.REDIS_URL || process.env.REDIS_SENTINELS) && !this.isLeader) return;
        if (this.isPublishing) {
            this.pendingPublish = true;
            return;
        }
        this.isPublishing = true;
        try {
            const agents = await this.svc.getAgentStatus({ includePosition: false });
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
            const wire = buildWirePayload(this, { agents: data.agents, state: data.state, eventId });
            if (!wire) return;
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
        chain.push((req, res, next) => handleStream(this, req, res, next));
        app.get('/api/stream', ...chain);
    }

    shutdown() {
        if (this.ssePingInterval) clearInterval(this.ssePingInterval);
        if (this.leaderInterval) clearInterval(this.leaderInterval);
        shutdownRedis(this);
        for (const res of this.sseClients) {
            res.end();
        }
        this.sseClients.clear();
    }
}

module.exports = SSEService;
