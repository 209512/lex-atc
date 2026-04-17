const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const { loadBackendConfig } = require('../config/env');
const ArchivingWorker = require('./ArchivingWorker');

const logger = require('../utils/logger');
const PostgresAdapter = require('./db/adapters/PostgresAdapter');
const MemoryAdapter = require('./db/adapters/MemoryAdapter');
const SqliteAdapter = require('./db/adapters/SqliteAdapter');
const ChannelRepository = require('./db/repositories/ChannelRepository');
const AgentRepository = require('./db/repositories/AgentRepository');
const SystemRepository = require('./db/repositories/SystemRepository');
const { EVENT_TYPES } = require('@lex-atc/shared');
const EventRepository = require('./db/repositories/EventRepository');

class DatabaseManager {
    constructor() {
        this.mode = null;
        this.redis = null;
        this._lastRedisErrorAt = 0;
        this.eventBuffer = [];
        this.flushInterval = null;
        this.isFlushing = false;
        this.pendingCheckpoints = new Map();

        this.postgresAdapter = new PostgresAdapter();
        this.memoryAdapter = new MemoryAdapter();
        // Load sqlite adapter dynamically to avoid binary issues in tests if not needed
        try {
            const SqliteAdapter = require('./db/adapters/SqliteAdapter');
            this.sqliteAdapter = new SqliteAdapter();
        } catch (e) {
            this.sqliteAdapter = null;
        }

        this.channelRepo = new ChannelRepository(this);
        this.agentRepo = new AgentRepository(this);
        this.systemRepo = new SystemRepository(this);
        this.eventRepo = new EventRepository(this);
    }

    async init() {
        const cfg = loadBackendConfig(process.env);
        this.mode = cfg.db.mode;

        if ((process.env.REDIS_URL || process.env.REDIS_SENTINELS) && this.mode !== 'memory') {
            if (process.env.REDIS_SENTINELS) {
                const sentinels = process.env.REDIS_SENTINELS.split(',').map(s => {
                    const [host, port] = s.split(':');
                    return { host, port: parseInt(port, 10) };
                });
                this.redis = new Redis({
                    sentinels,
                    name: process.env.REDIS_SENTINEL_NAME || 'mymaster',
                    password: process.env.REDIS_PASSWORD || undefined,
                    maxRetriesPerRequest: null,
                    enableReadyCheck: false,
                    retryStrategy(times) { return Math.min(times * 50, 2000); }
                });
            } else {
                this.redis = new Redis(process.env.REDIS_URL, {
                    maxRetriesPerRequest: null,
                    enableReadyCheck: false,
                    retryStrategy(times) { return Math.min(times * 50, 2000); }
                });
            }
            this.redis.on('error', (err) => {
                const now = Date.now();
                if (now - this._lastRedisErrorAt > 5000) {
                    this._lastRedisErrorAt = now;
                    logger.warn('[DatabaseManager] Redis error:', err.message);
                }
            });
        }

        if (this.mode === 'memory') {
            await this.memoryAdapter.init();
            return;
        }

        if (process.env.USE_LITE_MODE === 'true') {
            this.mode = 'sqlite';
            await this.sqliteAdapter.init();
            this.startBackgroundWorker();
            return;
        }

        try {
            await this.postgresAdapter.init();
        } catch (error) {
            const explicitDb = Boolean(process.env.DATABASE_URL) || String(process.env.DB_MODE || '').toLowerCase() === 'pg';
            if (cfg.nodeEnv !== 'production' && !explicitDb) {
                this.mode = 'memory';
                await this.memoryAdapter.init();
                return;
            }
            throw error;
        }

        this.archivingWorker = new ArchivingWorker(this.postgresAdapter.getPool());
        this.archivingWorker.start();
        
        this.startBackgroundWorker();
    }

    startBackgroundWorker() {
        if (this.flushInterval) clearInterval(this.flushInterval);
        this.flushInterval = setInterval(() => {
            this.flushEventBuffer().catch(e => logger.error('[DatabaseManager] Event bulk insert failed:', e));
        }, 1000);
        if (this.flushInterval.unref) {
            this.flushInterval.unref();
        }
    }

    stop() {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
        if (this.archivingWorker) {
            this.archivingWorker.stop();
        }
        if (this.redis) {
            try { this.redis.disconnect(); } catch (e) { logger.debug(`Redis disconnect error: ${e.message}`); }
            this.redis = null;
        }
        try { this.postgresAdapter.stop(); } catch (e) { logger.error('PG stop error:', e.message); }
        try { this.memoryAdapter.stop(); } catch (e) { logger.error('Memory stop error:', e.message); }
        this.mode = null;
        this.eventBuffer = [];
        this.isFlushing = false;
        this.pendingCheckpoints = new Map();
    }

    get pool() {
        if (this.mode === 'sqlite') return this.sqliteAdapter.getPool();
        return this.postgresAdapter.getPool();
    }

    get memory() {
        return this.memoryAdapter.getStore();
    }

    async flushEventBuffer() {
        if (this.isFlushing) return;
        this.isFlushing = true;
        
        let batch = [];
        
        if (this.redis && this.redis.status === 'ready') {
            // First flush local buffer if redis just recovered
            if (this.eventBuffer.length > 0) {
                batch = this.eventBuffer.splice(0, this.eventBuffer.length);
            } else {
                try {
                    const rawBatch = await this.redis.lpop('event_buffer', 100);
                    if (rawBatch && rawBatch.length > 0) {
                        batch = rawBatch.map(str => JSON.parse(str));
                    }
                } catch (e) {
                    logger.debug(`[DatabaseManager] Redis lpop error: ${e.message}`);
                }
            }
        } else {
            batch = this.eventBuffer.splice(0, this.eventBuffer.length);
        }

        if (batch.length === 0) {
            this.isFlushing = false;
            return;
        }

        try {
            await this.eventRepo.flushBatch(batch);
        } catch (e) {
            logger.error('[DatabaseManager] Bulk insert error. Moving batch to DLQ to prevent data loss:', e.message);
            if (this.redis && this.redis.status === 'ready') {
                for (const row of batch) {
                    await this.redis.rpush('event_dlq', JSON.stringify(row)).catch(err => {
                        logger.error('[DatabaseManager] Failed to push to DLQ:', err.message);
                    });
                }
            } else {
                this.eventBuffer.unshift(...batch);
            }
        } finally {
            this.isFlushing = false;
        }
    }

    async upsertChannel(params) {
        return this.channelRepo.upsertChannel(params);
    }

    async getChannel(channelId) {
        return this.channelRepo.getChannel(channelId);
    }

    async insertChannelSnapshot(snapshot) {
        return this.channelRepo.insertChannelSnapshot(snapshot);
    }

    async getDispute(idempotencyKey) {
        return this.channelRepo.getDispute(idempotencyKey);
    }

    async insertDispute(params) {
        return this.channelRepo.insertDispute(params);
    }

    async getChannelSnapshot(channelId, nonce) {
        return this.channelRepo.getChannelSnapshot(channelId, nonce);
    }

    async updateSnapshotOnchainStatus(params) {
        return this.channelRepo.updateSnapshotOnchainStatus(params);
    }

    async appendEvent(evt) {
        const event = { ...evt };

        const isValid = await this.eventRepo.validateEvent(event, this.eventBuffer, this.redis, this.pendingCheckpoints);
        if (!isValid) return { inserted: false };

        const row = {
            id: event.id || uuidv4(),
            global_seq: Number(event.globalSeq),
            shard_id: String(event.shardId),
            shard_seq: Number(event.shardSeq),
            shard_epoch: Number(event.shardEpoch),
            resource_id: event.resourceId || null,
            fence_token: event.fenceToken || null,
            actor_uuid: String(event.actorUuid),
            action: String(event.action),
            correlation_id: String(event.correlationId),
            payload: event.payload || {},
            created_at: event.createdAt || new Date().toISOString(),
        };

        try {
            if (this.redis && this.redis.status === 'ready') {
                await this.redis.rpush('event_buffer', JSON.stringify(row));
            } else {
                this.eventBuffer.push(row);
            }
            return { inserted: true };
        } catch (e) {
            logger.error(`[DatabaseManager] Failed to append event: ${e.message}`);
            return { inserted: false };
        }
    }

    async saveAgentSnapshot(agent, meta = {}) {
        return this.agentRepo.saveAgentSnapshot(agent, meta);
    }

    async saveAgentState(agent) {
        return this.agentRepo.saveAgentState(agent);
    }

    async loadAgentState(uuid) {
        return this.agentRepo.loadAgentState(uuid);
    }

    async getSnapshotGlobalSeq() {
        return this.systemRepo.getSnapshotGlobalSeq();
    }

    async loadEventsAfter(globalSeq) {
        return this.eventRepo.loadEventsAfter(globalSeq, this.eventBuffer, this.redis);
    }

    async loadAllSnapshots() {
        return this.agentRepo.loadAllSnapshots();
    }

    async replayToHazelcast(atcService) {
        if (!atcService) return;

        const snapshots = await this.loadAllSnapshots();
        if (atcService.sharedClient && snapshots.length > 0) {
            const CONSTANTS = require('../config/constants');
            const map = await atcService.sharedClient.getMap(CONSTANTS.MAP_AGENT_STATES);
            for (const s of snapshots) {
                const agentUuid = String(s.agent_uuid);
                await map.put(agentUuid, {
                    uuid: agentUuid,
                    address: s.address || null,
                    model: s.model || null,
                    position: s.position || null,
                    account: s.account || {},
                    stats: s.stats || {},
                    snapshotGlobalSeq: Number(s.snapshot_global_seq || 0),
                    snapshotCreatedAt: s.snapshot_created_at || null,
                });
            }
        }

        const base = await this.getSnapshotGlobalSeq();
        const events = await this.loadEventsAfter(base);

        for (const e of events) {
            if (atcService.isolationEngine && typeof atcService.isolationEngine.applyEvent === 'function') {
                if (String(e.action || '').startsWith('TASK_')) {
                    atcService.isolationEngine.applyEvent(e);
                }
            }

            if (atcService.governanceEngine && typeof atcService.governanceEngine.applyEvent === 'function') {
                if (String(e.action || '').startsWith('GOV_')) {
                    atcService.governanceEngine.applyEvent(e);
                }
            }

            const shardId = e.shard_id;
            const shard = atcService.state?.shards?.[shardId];
            const payload = e.payload || {};

            if (shard) {
                if (e.action === EVENT_TYPES.SHARD_EPOCH_BUMP) {
                    shard.epoch = Number(payload.epoch ?? shard.epoch);
                    shard.resourceId = String(payload.resourceId ?? shard.resourceId);
                    shard.holder = null;
                    shard.fencingToken = null;
                    shard.lease = null;
                    shard.forcedCandidate = payload.forcedCandidate || null;
                }

                if (e.action === EVENT_TYPES.LOCK_ACQUIRED) {
                    shard.holder = String(e.actor_uuid);
                    shard.fencingToken = String(e.fence_token || '');
                    shard.resourceId = String(e.resource_id || shard.resourceId);
                    shard.epoch = Number(e.shard_epoch);
                    shard.lease = payload.lease || shard.lease;
                }

                if (e.action === EVENT_TYPES.LOCK_RELEASED) {
                    if (String(shard.holder) === String(e.actor_uuid)) {
                        shard.holder = null;
                        shard.fencingToken = null;
                        shard.lease = null;
                    }
                }
            }
        }

        const primary = atcService.getShardIds ? atcService.getShardIds()[0] : null;
        if (primary && atcService._syncLegacyStateFromShard) {
            atcService._syncLegacyStateFromShard(primary);
        }
        if (typeof atcService.emitState === 'function') atcService.emitState();
    }
}

const key = '__LEX_ATC_DB_SINGLETON__';
if (!globalThis[key]) {
    globalThis[key] = new DatabaseManager();
}
module.exports = globalThis[key];
