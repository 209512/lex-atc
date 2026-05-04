const { v4: uuidv4 } = require('uuid');
const logger = require('../../../utils/logger');

const flushEventBuffer = async (manager) => {
    if (manager.isFlushing) return;
    manager.isFlushing = true;

    let batch = [];

    if (manager.redis && manager.redis.status === 'ready') {
        if (manager.eventBuffer.length > 0) {
            batch = manager.eventBuffer.splice(0, manager.eventBuffer.length);
        } else {
            try {
                const rawBatch = await manager.redis.lpop('event_buffer', 100);
                if (rawBatch && rawBatch.length > 0) {
                    batch = rawBatch.map(str => JSON.parse(str));
                }
            } catch (e) {
                logger.debug(`[DatabaseManager] Redis lpop error: ${e.message}`);
            }
        }
    } else {
        batch = manager.eventBuffer.splice(0, manager.eventBuffer.length);
    }

    if (batch.length === 0) {
        manager.isFlushing = false;
        return;
    }

    try {
        await manager.eventRepo.flushBatch(batch);
    } catch (e) {
        logger.error('[DatabaseManager] Bulk insert error. Moving batch to DLQ to prevent data loss:', e.message);
        if (manager.redis && manager.redis.status === 'ready') {
            for (const row of batch) {
                await manager.redis.rpush('event_dlq', JSON.stringify(row)).catch(err => {
                    logger.error('[DatabaseManager] Failed to push to DLQ:', err.message);
                });
            }
        } else {
            manager.eventBuffer.unshift(...batch);
        }
    } finally {
        manager.isFlushing = false;
    }
};

const appendEvent = async (manager, evt) => {
    const event = { ...evt };

    const isValid = await manager.eventRepo.validateEvent(event, manager.eventBuffer, manager.redis, manager.pendingCheckpoints);
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
        if (manager.redis && manager.redis.status === 'ready') {
            await manager.redis.rpush('event_buffer', JSON.stringify(row));
        } else {
            manager.eventBuffer.push(row);
        }
        return { inserted: true };
    } catch (e) {
        logger.error(`[DatabaseManager] Failed to append event: ${e.message}`);
        return { inserted: false };
    }
};

module.exports = {
    flushEventBuffer,
    appendEvent,
};

