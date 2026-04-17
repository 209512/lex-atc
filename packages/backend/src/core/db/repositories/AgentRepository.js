class AgentRepository {
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

    async saveAgentSnapshot(agent, meta = {}) {
        const agentUuid = String(agent?.uuid || '');
        if (!agentUuid) return;

        const toJsonParam = (v) => {
            if (v === undefined) return null;
            if (v === null) return null;
            if (typeof v === 'string') return v;
            return JSON.stringify(v);
        };

        const row = {
            agent_uuid: agentUuid,
            address: agent.address || null,
            model: agent.config?.model || null,
            position: toJsonParam(agent.lastKnownPosition),
            account: toJsonParam(agent.account || {}),
            stats: toJsonParam(agent.stats || {}),
            snapshot_global_seq: Number(meta.globalSeq || 0),
        };

        if (this.isMemory) {
            const localStore = this.store;
            if (!localStore) return;
            localStore.snapshots.set(agentUuid, { ...row, snapshot_created_at: new Date().toISOString() });

            const prev = localStore.systemCheckpoint.get('snapshot_global_seq') ?? -1;
            if (row.snapshot_global_seq > prev) localStore.systemCheckpoint.set('snapshot_global_seq', row.snapshot_global_seq);
            return;
        }

        const localPool = this.pool;
        if (!localPool) return;

        await localPool.query(
            `
            INSERT INTO agent_snapshots_p0 (
                agent_uuid, address, model, position, account, stats, snapshot_global_seq
            ) VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (agent_uuid) DO UPDATE SET
                address = EXCLUDED.address,
                model = EXCLUDED.model,
                position = EXCLUDED.position,
                account = EXCLUDED.account,
                stats = EXCLUDED.stats,
                snapshot_global_seq = GREATEST(agent_snapshots_p0.snapshot_global_seq, EXCLUDED.snapshot_global_seq),
                snapshot_created_at = NOW()
            `,
            [
                row.agent_uuid,
                row.address,
                row.model,
                row.position,
                row.account,
                row.stats,
                row.snapshot_global_seq,
            ]
        );

        await this.pool.query(
            `
            UPDATE system_checkpoints
            SET value = GREATEST(value, $2), updated_at = NOW()
            WHERE key = $1
            `,
            ['snapshot_global_seq', row.snapshot_global_seq]
        );
    }

    async saveAgentState(agent) {
        return this.saveAgentSnapshot(agent, { globalSeq: 0 });
    }

    async loadAgentState(uuid) {
        const id = String(uuid || '');
        if (!id) return null;

        if (this.isMemory) {
            const localStore = this.store;
            if (!localStore) return null;
            const snap = localStore.snapshots.get(id);
            if (!snap) return null;
            return {
                uuid: id,
                address: snap.address,
                reputation: Number(snap.account?.reputation ?? 0),
                balance: Number(snap.account?.balance ?? 0),
                total_earned: Number(snap.account?.totalEarned ?? 0),
                success_count: Number(snap.stats?.successCount ?? 0),
                total_tasks: Number(snap.stats?.totalTasks ?? 0),
                avg_latency: Number(snap.stats?.avgAiLatency ?? 2000),
                last_seen: snap.snapshot_created_at,
            };
        }
        
        const localPool = this.pool;
        if (!localPool) return null;

        const res = await localPool.query(
            `SELECT * FROM agent_snapshots WHERE agent_uuid = $1`,
            [id]
        );
        const row = res.rows[0];
        if (!row) return null;
        return {
            uuid: row.agent_uuid,
            address: row.address,
            reputation: Number(row.account?.reputation ?? 0),
            balance: Number(row.account?.balance ?? 0),
            total_earned: Number(row.account?.totalEarned ?? 0),
            success_count: Number(row.stats?.successCount ?? 0),
            total_tasks: Number(row.stats?.totalTasks ?? 0),
            avg_latency: Number(row.stats?.avgAiLatency ?? 2000),
            last_seen: row.snapshot_created_at,
        };
    }

    async loadAllSnapshots() {
        if (this.isMemory) {
            const localStore = this.store;
            if (!localStore) return [];
            return Array.from(localStore.snapshots.values());
        }

        const localPool = this.pool;
        if (!localPool) return [];

        const res = await localPool.query(
            `SELECT * FROM agent_snapshots`,
            []
        );
        return res.rows;
    }
}

module.exports = AgentRepository;
