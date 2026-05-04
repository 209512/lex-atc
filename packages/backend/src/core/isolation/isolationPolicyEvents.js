module.exports = function applyEvent(engine, e) {
    const payload = e.payload || {};
    const taskId = payload.taskId;
    if (!taskId) return;

    if (!engine.tasks.has(taskId)) {
        engine.tasks.set(taskId, {
            taskId,
            actorUuid: String(e.actor_uuid || payload.actorUuid || ''),
            shardId: String(e.shard_id || payload.shardId || ''),
            shardEpoch: Number(e.shard_epoch || payload.shardEpoch || 0),
            resourceId: e.resource_id || payload.resourceId || null,
            fenceToken: e.fence_token || payload.fenceToken || null,
            classification: payload.classification || 'reversible',
            requiresFinalization: payload.requiresFinalization ?? true,
            status: 'PENDING',
            intent: payload.intent || { text: '' },
            createdAt: Date.now(),
            timeoutAt: Date.now(),
            executedAt: null,
            rolledBackAt: null,
            finalizedAt: null,
            lastError: null,
        });
    }

    const t = engine.tasks.get(taskId);
    if (e.action === 'TASK_EXECUTION_DEFERRED') {
        t.status = 'PENDING';
        t.timeoutAt = Number(payload.timeoutAt || t.timeoutAt);
        engine.queue.add(t);
    }
    if (e.action === 'TASK_FINALIZED') {
        t.status = 'FINALIZED';
        engine.queue.add(t);
    }
    if (e.action === 'TASK_EXECUTED') {
        t.status = 'EXECUTED';
        engine.queue.remove(taskId);
    }
    if (e.action === 'TASK_ROLLED_BACK' || e.action === 'TASK_CANCELLED' || e.action === 'TASK_TIMEOUT') {
        t.status = e.action === 'TASK_TIMEOUT' ? 'TIMED_OUT' : (e.action === 'TASK_CANCELLED' ? 'CANCELLED' : 'ROLLED_BACK');
        engine.queue.remove(taskId);
    }
};

