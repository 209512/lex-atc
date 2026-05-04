const { loadBackendConfig } = require('../config/env');
const ArchivingWorker = require('./ArchivingWorker');

const logger = require('../utils/logger');
const PostgresAdapter = require('./db/adapters/PostgresAdapter');
const MemoryAdapter = require('./db/adapters/MemoryAdapter');
const SqliteAdapter = require('./db/adapters/SqliteAdapter');
const ChannelRepository = require('./db/repositories/ChannelRepository');
const AgentRepository = require('./db/repositories/AgentRepository');
const SystemRepository = require('./db/repositories/SystemRepository');
const EventRepository = require('./db/repositories/EventRepository');
const { initRedis, stopRedis } = require('./db/manager/dbRedis');
const { startBackgroundWorker, stopBackgroundWorker } = require('./db/manager/dbBackground');
const { flushEventBuffer, appendEvent } = require('./db/manager/dbEvents');
const { replayToHazelcast } = require('./db/manager/dbReplay');

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

        initRedis(this, cfg);

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
        return startBackgroundWorker(this);
    }

    stop() {
        stopBackgroundWorker(this);
        if (this.archivingWorker) {
            this.archivingWorker.stop();
        }
        stopRedis(this);
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
        return flushEventBuffer(this);
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
        return appendEvent(this, evt);
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
        return replayToHazelcast(this, atcService);
    }
}

module.exports = new DatabaseManager();
