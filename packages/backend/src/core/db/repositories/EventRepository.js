const logger = require('../../../utils/logger');
const { v4: uuidv4 } = require('uuid');

class EventRepository {
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

    async flushBatch(batch) {
        if (batch.length === 0) return;

        if (this.isMemory) {
            const touched = new Set();
            for (const row of batch) {
                const shardKey = `${row.shard_id}:${row.shard_seq}`;
                this.store.eventsByCorrelation.set(row.correlation_id, row);
                this.store.eventsByShardSeq.set(shardKey, row);
                touched.add(row.shard_id);
            }
            for (const shardId of touched) {
                let cp = Number(this.store.shardCheckpoint.get(shardId) ?? -1);
                while (this.store.eventsByShardSeq.has(`${shardId}:${cp + 1}`)) {
                    cp += 1;
                }
                this.store.shardCheckpoint.set(shardId, cp);
            }
            return;
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Bulk Insert Events
            const values = [];
            const placeholders = [];
            let i = 1;
            for (const row of batch) {
                placeholders.push(`($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`);
                values.push(
                    row.id, row.global_seq, row.shard_id, row.shard_seq, row.shard_epoch,
                    row.resource_id, row.fence_token, row.actor_uuid, row.action, row.correlation_id, row.payload, row.created_at
                );
            }

            const query = `
                INSERT INTO event_logs_p0 (
                    id, global_seq, shard_id, shard_seq, shard_epoch,
                    resource_id, fence_token, actor_uuid, action, correlation_id, payload, created_at
                ) VALUES ${placeholders.join(',')}
                ON CONFLICT DO NOTHING
            `;
            await client.query(query, values);

            // Update Checkpoints efficiently (get max shard_seq per shard)
            const checkpoints = new Map();
            for (const row of batch) {
                const prev = checkpoints.get(row.shard_id) || { s: -1, g: -1 };
                checkpoints.set(row.shard_id, {
                    s: Math.max(prev.s, row.shard_seq),
                    g: Math.max(prev.g, row.global_seq)
                });
            }

            for (const [shardId, cp] of checkpoints.entries()) {
                await client.query(
                    `
                    INSERT INTO shard_checkpoints (shard_id, last_shard_seq, last_global_seq)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (shard_id) DO UPDATE SET
                        last_shard_seq = CASE WHEN shard_checkpoints.last_shard_seq > EXCLUDED.last_shard_seq THEN shard_checkpoints.last_shard_seq ELSE EXCLUDED.last_shard_seq END,
                        last_global_seq = CASE WHEN shard_checkpoints.last_global_seq > EXCLUDED.last_global_seq THEN shard_checkpoints.last_global_seq ELSE EXCLUDED.last_global_seq END,
                        updated_at = CURRENT_TIMESTAMP
                    `,
                    [shardId, cp.s, cp.g]
                );
            }

            await client.query('COMMIT');
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch (rollbackErr) {
                logger.error('[EventRepository] Rollback failed:', rollbackErr.message);
            }
            throw e;
        } finally {
            client.release();
        }
    }

    async validateEvent(event, eventBuffer, redis, pendingCheckpoints) {
        if (!event.correlationId) throw new Error('correlationId is required');
        if (!event.action) throw new Error('action is required');
        if (!event.actorUuid) throw new Error('actorUuid is required');
        if (!event.shardId) throw new Error('shardId is required');
        if (event.globalSeq === undefined || event.globalSeq === null) throw new Error('globalSeq is required');
        if (event.shardSeq === undefined || event.shardSeq === null) throw new Error('shardSeq is required');
        if (event.shardEpoch === undefined || event.shardEpoch === null) throw new Error('shardEpoch is required');

        if (event.fenceToken && !this.isMemory) {
            try {
                // Strict Fencing Token Monotonicity Check at DB layer
                const res = await this.pool.query(
                    `SELECT fence_token FROM event_logs 
                     WHERE resource_id = $1 
                     ORDER BY global_seq DESC LIMIT 1`,
                    [event.resourceId]
                );
                if (res && res.rows && res.rows.length > 0) {
                    const lastToken = res.rows[0].fence_token;
                    if (lastToken && BigInt(event.fenceToken) <= BigInt(lastToken)) {
                        logger.warn(`[EventRepository] Fencing Token violation detected in DB! Rejecting write. Resource: ${event.resourceId}, Attempted: ${event.fenceToken}, Last: ${lastToken}`);
                        return false;
                    }
                }
            } catch (e) {
                // Ignore DB error during validation phase
            }
        }

        if (this.isMemory) {
            let isDuplicateBuffer = false;
            if (redis && redis.status === 'ready') {
                try {
                    const rawBatch = await redis.lrange('event_buffer', 0, -1);
                    if (rawBatch && rawBatch.length > 0) {
                        const buffered = rawBatch.map(str => JSON.parse(str));
                        isDuplicateBuffer = buffered.some(e => e.correlation_id === event.correlationId);
                        if (!isDuplicateBuffer && buffered.some(e => e.shard_id === event.shardId && e.shard_seq === event.shardSeq)) {
                            throw new Error('Duplicate shard sequence with different correlation');
                        }
                    }
                } catch (e) {
                    logger.error('[DatabaseManager] Redis error during memory check:', e.message);
                }
            } else {
                isDuplicateBuffer = eventBuffer.some(e => e.correlation_id === event.correlationId);
                if (!isDuplicateBuffer && eventBuffer.some(e => e.shard_id === event.shardId && e.shard_seq === event.shardSeq)) {
                    throw new Error('Duplicate shard sequence with different correlation');
                }
            }

            if (isDuplicateBuffer || this.store.eventsByCorrelation.has(event.correlationId)) {
                return false;
            }

            const shardKey = `${event.shardId}:${event.shardSeq}`;
            if (this.store.eventsByShardSeq.has(shardKey)) {
                throw new Error('Duplicate shard sequence with different correlation');
            }

            const last = Math.max(
                this.store.shardCheckpoint.get(event.shardId) ?? -1,
                pendingCheckpoints.get(event.shardId) ?? -1
            );
            if (last === -1 && Number(event.shardSeq) !== 0) {
                logger.warn(`[EventRepository] Shard sequence starts with gap for shard ${event.shardId}: expected 0, got ${event.shardSeq}. Buffering out-of-order event.`);
                return true;
            }
            if (event.shardSeq < last) {
                throw new Error('Out-of-order shard sequence');
            }
            if (event.shardSeq > last + 1 && last >= 0) {
                logger.warn(`[EventRepository] Shard sequence gap detected for shard ${event.shardId}: expected ${last + 1}, got ${event.shardSeq}. Buffering out-of-order event.`);
                return true;
            }

            pendingCheckpoints.set(event.shardId, Number(event.shardSeq));
        } else {
            const last = pendingCheckpoints.get(event.shardId);
            const next = Number(event.shardSeq);
            if (last === undefined) {
                pendingCheckpoints.set(event.shardId, next);
            } else {
                pendingCheckpoints.set(event.shardId, Math.max(Number(last), next));
            }
        }
        return true;
    }

    async loadEventsAfter(globalSeq, eventBuffer, redis) {
        const after = Number(globalSeq || 0);

        let bufferedEvents = [];
        if (redis && redis.status === 'ready') {
            const rawBatch = await redis.lrange('event_buffer', 0, -1);
            if (rawBatch && rawBatch.length > 0) {
                bufferedEvents = rawBatch.map(str => JSON.parse(str));
            }
        } else {
            bufferedEvents = eventBuffer;
        }

        if (this.isMemory) {
            const events = Array.from(this.store.eventsByCorrelation.values()).concat(bufferedEvents);
            
            const uniqueEvents = new Map();
            for (const e of events) uniqueEvents.set(e.correlation_id, e);
            
            return Array.from(uniqueEvents.values())
                .filter(e => Number(e.global_seq) > after)
                .sort((a, b) => Number(a.global_seq) - Number(b.global_seq));
        }

        const res = await this.pool.query(
            `SELECT * FROM event_logs WHERE global_seq > $1 ORDER BY global_seq ASC`,
            [after]
        );
        
        const dbEvents = res.rows;
        bufferedEvents = bufferedEvents.filter(e => Number(e.global_seq) > after);
        
        const allEvents = new Map();
        for (const e of dbEvents) allEvents.set(e.correlation_id, e);
        for (const e of bufferedEvents) allEvents.set(e.correlation_id, e);
        
        return Array.from(allEvents.values()).sort((a, b) => Number(a.global_seq) - Number(b.global_seq));
    }
}

module.exports = EventRepository;
