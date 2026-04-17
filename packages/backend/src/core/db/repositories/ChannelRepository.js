const logger = require('../../../utils/logger');

class ChannelRepository {
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
        if (this.adapterManager.mode === 'sqlite') return this.adapterManager.sqliteAdapter.getPool();
        return this.adapterManager.postgresAdapter.getPool();
    }

    async upsertChannel({ channelId, agentUuid, participantAgent, participantTreasury, disputeWindowMs }) {
        const row = {
            channelId: String(channelId),
            agentUuid: String(agentUuid),
            participantAgent: String(participantAgent),
            participantTreasury: String(participantTreasury),
            disputeWindowMs: Number(disputeWindowMs),
        };

        if (this.isMemory) {
            const existing = this.store.channels.get(row.channelId);
            const next = {
                channel_id: row.channelId,
                agent_uuid: row.agentUuid,
                participant_agent: row.participantAgent,
                participant_treasury: row.participantTreasury,
                last_nonce: existing?.last_nonce ?? -1,
                last_state_hash: existing?.last_state_hash ?? null,
                dispute_window_ms: row.disputeWindowMs,
                created_at: existing?.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            this.store.channels.set(row.channelId, next);
            return next;
        }

        await this.pool.query(
            `
            INSERT INTO state_channels (channel_id, agent_uuid, participant_agent, participant_treasury, dispute_window_ms)
            VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (channel_id) DO UPDATE SET
                participant_agent = EXCLUDED.participant_agent,
                participant_treasury = EXCLUDED.participant_treasury,
                dispute_window_ms = EXCLUDED.dispute_window_ms,
                updated_at = CURRENT_TIMESTAMP
            `,
            [row.channelId, row.agentUuid, row.participantAgent, row.participantTreasury, row.disputeWindowMs]
        );

        const res = await this.pool.query(`SELECT * FROM state_channels WHERE channel_id = $1`, [row.channelId]);
        return res.rows[0];
    }

    async getChannel(channelId) {
        const id = String(channelId);
        if (this.isMemory) {
            return this.store.channels.get(id) || null;
        }

        const res = await this.pool.query(`SELECT * FROM state_channels WHERE channel_id = $1`, [id]);
        return res.rows[0] || null;
    }

    async insertChannelSnapshot(snapshot) {
        if (!snapshot) throw new Error('Missing snapshot');
        const row = {
            id: String(snapshot.id),
            channelId: String(snapshot.channelId),
            nonce: Number(snapshot.nonce),
            balances: snapshot.balances || {},
            stateHash: String(snapshot.stateHash),
            signatures: snapshot.signatures || {},
            disputeWindowMs: Number(snapshot.disputeWindowMs),
            validUntil: snapshot.validUntil,
            status: String(snapshot.status),
            taskId: snapshot.taskId || null,
            globalSeq: Number(snapshot.globalSeq),
            shardId: String(snapshot.shardId),
            shardEpoch: Number(snapshot.shardEpoch),
            resourceId: snapshot.resourceId || null,
        };

        if (this.isMemory) {
            if (this.store.channelHashes.has(row.stateHash)) throw new Error('Duplicate state hash');
            const last = this.store.channelNonce.get(row.channelId) ?? -1;
            if (row.nonce <= last) throw new Error('Stale nonce');
            if (row.nonce !== last + 1) throw new Error('Nonce gap');

            this.store.channelHashes.add(row.stateHash);
            this.store.channelNonce.set(row.channelId, row.nonce);
            this.store.channelSnapshots.set(`${row.channelId}:${row.nonce}`, {
                id: row.id,
                channel_id: row.channelId,
                nonce: row.nonce,
                balances: row.balances,
                state_hash: row.stateHash,
                signatures: row.signatures,
                dispute_window_ms: row.disputeWindowMs,
                valid_until: row.validUntil,
                status: row.status,
                task_id: row.taskId,
                global_seq: row.globalSeq,
                shard_id: row.shardId,
                shard_epoch: row.shardEpoch,
                resource_id: row.resourceId,
                created_at: new Date().toISOString(),
            });

            const ch = this.store.channels.get(row.channelId);
            if (ch) {
                ch.last_nonce = row.nonce;
                ch.last_state_hash = row.stateHash;
                ch.updated_at = new Date().toISOString();
                this.store.channels.set(row.channelId, ch);
            }
            return { inserted: true };
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            
            // Avoid advisory locks in sqlite
            if (this.adapterManager.mode !== 'sqlite') {
                await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [row.channelId]);
            }

            const chRes = await client.query(
                this.adapterManager.mode === 'sqlite' 
                    ? `SELECT last_nonce FROM state_channels WHERE channel_id = $1`
                    : `SELECT last_nonce FROM state_channels WHERE channel_id = $1 FOR UPDATE`,
                [row.channelId]
            );
            const lastNonce = chRes.rows[0]?.last_nonce !== undefined ? Number(chRes.rows[0].last_nonce) : -1;
            if (row.nonce <= lastNonce) throw new Error('Stale nonce');
            if (row.nonce !== lastNonce + 1) throw new Error('Nonce gap');

            await client.query(
                `
                INSERT INTO channel_snapshots (
                    id, channel_id, nonce, balances, state_hash, signatures,
                    dispute_window_ms, valid_until, status, task_id,
                    global_seq, shard_id, shard_epoch, resource_id
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                `,
                [
                    row.id, row.channelId, row.nonce, row.balances, row.stateHash, row.signatures,
                    row.disputeWindowMs, row.validUntil, row.status, row.taskId,
                    row.globalSeq, row.shardId, row.shardEpoch, row.resourceId,
                ]
            );

            await client.query(
                `
                UPDATE state_channels
                SET last_nonce = $2, last_state_hash = $3, updated_at = CURRENT_TIMESTAMP
                WHERE channel_id = $1
                `,
                [row.channelId, row.nonce, row.stateHash]
            );

            await client.query('COMMIT');
            return { inserted: true };
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch (rollbackErr) {
                logger.error('[ChannelRepository] Rollback failed:', rollbackErr.message);
            }
            throw e;
        } finally {
            client.release();
        }
    }

    async insertDispute({ disputeId, channelId, openedBy, targetNonce, reason, status, idempotencyKey }) {
        const row = {
            disputeId: String(disputeId),
            channelId: String(channelId),
            openedBy: String(openedBy),
            targetNonce: Number(targetNonce),
            reason: String(reason),
            status: String(status),
            idempotencyKey: idempotencyKey ? String(idempotencyKey) : null,
        };

        if (this.isMemory) {
            this.store.channelDisputes.set(row.disputeId, {
                dispute_id: row.disputeId,
                channel_id: row.channelId,
                opened_by: row.openedBy,
                target_nonce: row.targetNonce,
                reason: row.reason,
                status: row.status,
                idempotency_key: row.idempotencyKey,
                created_at: new Date().toISOString(),
                resolved_at: null,
            });
            return { inserted: true };
        }

        await this.pool.query(
            `
            INSERT INTO channel_disputes (dispute_id, channel_id, opened_by, target_nonce, reason, status, idempotency_key)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (dispute_id) DO NOTHING
            `,
            [row.disputeId, row.channelId, row.openedBy, row.targetNonce, row.reason, row.status, row.idempotencyKey]
        );
        return { inserted: true };
    }

    async getDispute(idempotencyKey) {
        if (!this.pool) return null;
        try {
            const res = await this.pool.query(
                `SELECT status FROM channel_disputes WHERE idempotency_key = $1 LIMIT 1`,
                [idempotencyKey]
            );
            return res.rows[0] || null;
        } catch (err) {
            return null;
        }
    }

    async getChannelSnapshot(channelId, nonce) {
        const id = String(channelId);
        const n = Number(nonce);

        if (this.isMemory) {
            return this.store.channelSnapshots.get(`${id}:${n}`) || null;
        }

        const res = await this.pool.query(
            `SELECT * FROM channel_snapshots WHERE channel_id = $1 AND nonce = $2`,
            [id, n]
        );
        return res.rows[0] || null;
    }

    async updateSnapshotOnchainStatus({ channelId, nonce, txid, status, commitment }) {
        const id = String(channelId);
        const n = Number(nonce);
        const onchainTxid = txid ? String(txid) : null;
        const onchainStatus = status ? String(status) : null;
        const onchainCommitment = commitment ? String(commitment) : null;

        if (this.isMemory) {
            const key = `${id}:${n}`;
            const snap = this.store.channelSnapshots.get(key);
            if (!snap) return { updated: false };
            snap.onchain_txid = onchainTxid;
            snap.onchain_status = onchainStatus;
            snap.onchain_commitment = onchainCommitment;
            snap.onchain_confirmed_at = new Date().toISOString();
            this.store.channelSnapshots.set(key, snap);
            return { updated: true };
        }

        await this.pool.query(
            `
            UPDATE channel_snapshots
            SET
              onchain_txid = $3,
              onchain_status = $4,
              onchain_commitment = $5,
              onchain_confirmed_at = CURRENT_TIMESTAMP
            WHERE channel_id = $1 AND nonce = $2
            `,
            [id, n, onchainTxid, onchainStatus, onchainCommitment]
        );
        return { updated: true };
    }
}

module.exports = ChannelRepository;
