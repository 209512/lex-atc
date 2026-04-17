class SystemRepository {
    constructor(adapterManager) {
        this.adapterManager = adapterManager;
    }

    get isMemory() {
        return this.adapterManager.mode === 'memory';
    }

    get store() {
        return this.adapterManager.memoryAdapter.getStore();
    }

    get pool() {
        return this.adapterManager.postgresAdapter.getPool();
    }

    async getSnapshotGlobalSeq() {
        if (this.isMemory) {
            return Number(this.store.systemCheckpoint.get('snapshot_global_seq') ?? -1);
        }

        const res = await this.pool.query(
            `SELECT value FROM system_checkpoints WHERE key = $1`,
            ['snapshot_global_seq']
        );
        return Number(res.rows[0]?.value ?? -1);
    }
}

module.exports = SystemRepository;
