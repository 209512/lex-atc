module.exports = function getPublicState(engine) {
    const pending = [];
    const tasks = [];

    let waitingAdmin = 0;
    let inProgress = 0;
    let failed = 0;

    for (const t of engine.tasks.values()) {
        const summary = {
            taskId: t.taskId,
            actorUuid: t.actorUuid,
            shardId: t.shardId,
            shardEpoch: t.shardEpoch,
            resourceId: t.resourceId,
            fenceToken: t.fenceToken,
            classification: t.classification,
            requiresFinalization: Boolean(t.requiresFinalization),
            status: t.status,
            createdAt: t.createdAt,
            timeoutAt: t.timeoutAt,
            finalizedAt: t.finalizedAt,
            executedAt: t.executedAt,
            rolledBackAt: t.rolledBackAt,
            lastError: t.lastError,
        };

        tasks.push(summary);
        if (t.status === 'PENDING') {
            pending.push({
                taskId: t.taskId,
                actorUuid: t.actorUuid,
                shardId: t.shardId,
                classification: t.classification,
                status: t.status,
                createdAt: t.createdAt,
                timeoutAt: t.timeoutAt,
            });
        }

        if (t.status === 'PENDING') waitingAdmin += 1;
        if (t.status === 'FINALIZED') inProgress += 1;
        if (t.status === 'TIMED_OUT') failed += 1;
    }

    pending.sort((a, b) => a.createdAt - b.createdAt);
    tasks.sort((a, b) => b.createdAt - a.createdAt);

    const dlqTasks = Array.from(engine.dlq.values()).map(item => ({
        taskId: item.task.taskId,
        error: item.error,
        failedAt: item.failedAt
    })).sort((a, b) => b.failedAt - a.failedAt);

    return {
        pending,
        tasks: tasks.slice(0, 200),
        dlq: dlqTasks.slice(0, 100),
        summary: { waitingAdmin, inProgress, failed, dlqCount: engine.dlq.size },
    };
};

