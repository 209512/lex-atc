const { v4: uuidv4 } = require('uuid');

const createTestDb = async () => {
    jest.resetModules();
    process.env.DB_MODE = 'memory';
    process.env.DB_MEMORY_NAMESPACE = `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const db = require('../../src/core/DatabaseManager');
    await db.init();
    return db;
};

const createMockAtc = () => {
    const atc = {
        state: {
            shards: {
                'RG-0': {
                    shardId: 'RG-0',
                    epoch: 0,
                    resourceId: 'traffic-control-lock:RG-0:e0',
                    holder: null,
                    fencingToken: null,
                    forcedCandidate: null,
                    waitingAgents: [],
                    lease: null,
                    lastEscalationStep: -1,
                }
            },
            isolation: { pending: [], tasks: [] },
            settlement: { pending: [], channels: [] },
            governance: { proposals: [] },
            logs: []
        },
        agents: new Map(),
        events: [],
        sequencer: {
            nextGlobalSeq: async () => Date.now(),
        },
        recordEvent: async (e) => {
            atc.events.push(e);
            if (atc.isolationEngine && String(e.action).startsWith('TASK_')) {
                atc.isolationEngine.applyEvent(e);
            }
            if (atc.governanceEngine && String(e.action).startsWith('GOV_')) {
                atc.governanceEngine.applyEvent(e);
            }
            return e;
        },
        emitState: () => {},
        getShardIdForAgent: () => 'RG-0',
        addLog: (level, msg, type, meta) => {
            atc.state.logs.push({ id: uuidv4(), level, msg, type, meta, timestamp: Date.now() });
        },
        _syncLegacyStateFromShard: (shardId) => {
            const shard = atc.state.shards[shardId];
            if (!shard) return;
            atc.state.epoch = shard.epoch;
            atc.state.resourceId = shard.resourceId;
            atc.state.activeAgent = shard.holder;
            atc.state.fencingToken = shard.fencingToken;
            atc.state.waitingAgents = shard.waitingAgents;
            atc.state.lease = shard.lease;
        }
    };
    
    atc._syncLegacyStateFromShard('RG-0');
    return atc;
};

module.exports = {
    createTestDb,
    createMockAtc
};