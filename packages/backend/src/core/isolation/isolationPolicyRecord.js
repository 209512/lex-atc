const logger = require('../../utils/logger');

module.exports = async function record(engine, task, action, isolationState, extraPayload = {}) {
    const payload = {
        taskId: task.taskId,
        actorUuid: task.actorUuid,
        shardId: task.shardId,
        shardEpoch: task.shardEpoch,
        resourceId: task.resourceId,
        fenceToken: task.fenceToken,
        classification: task.classification,
        requiresFinalization: task.requiresFinalization,
        isolationState,
        ...extraPayload,
    };

    await engine.atcService.recordEvent({
        shardId: task.shardId,
        shardEpoch: task.shardEpoch,
        resourceId: task.resourceId,
        fenceToken: task.fenceToken,
        action,
        actorUuid: task.actorUuid,
        correlationId: `task:${task.taskId}:${action}`,
        payload
    }).catch(err => {
        logger.error(`[IsolationPolicyEngine] Failed to record event ${action} for task ${task.taskId}:`, err.message);
    });

    if (engine.atcService.state) {
        engine.atcService.state.isolation = engine.getPublicState();
    }
    if (typeof engine.atcService.emitState === 'function') engine.atcService.emitState();
};

