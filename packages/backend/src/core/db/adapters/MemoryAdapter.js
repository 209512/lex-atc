const { loadBackendConfig } = require('../../../config/env');

const memoryStores = new Map();

class MemoryAdapter {
    constructor() {
        this.store = null;
    }

    async init() {
        const cfg = loadBackendConfig(process.env);
        const ns = cfg.db.memoryNamespace || 'default';
        if (!memoryStores.has(ns)) {
            memoryStores.set(ns, {
                snapshots: new Map(),
                eventsByCorrelation: new Map(),
                eventsByShardSeq: new Map(),
                shardCheckpoint: new Map(),
                systemCheckpoint: new Map([['snapshot_global_seq', -1]]),
                channels: new Map(),
                channelSnapshots: new Map(),
                channelDisputes: new Map(),
                channelNonce: new Map(),
                channelHashes: new Set(),
            });
        }
        this.store = memoryStores.get(ns);
    }

    getStore() {
        return this.store;
    }

    async stop() {}
}

module.exports = MemoryAdapter;
