module.exports = async function executeAction(engine, action, params, ctx) {
    const a = String(action);
    const svc = engine.atcService;
    const targetId = String(params.targetId || params.uuid || '');

    if (a === 'OVERRIDE') return svc.humanOverride();
    if (a === 'RELEASE') return svc.releaseHumanLock();
    if (a === 'TRANSFER_LOCK') return svc.transferLock(targetId);
    if (a === 'PAUSE_AGENT') return svc.pauseAgent(targetId, Boolean(params.pause));
    if (a === 'TERMINATE_AGENT') return svc.terminateAgent(targetId);
    if (a === 'TOGGLE_STOP') return svc.toggleGlobalStop(Boolean(params.enable));
    if (a === 'SCALE_AGENTS') return svc.updateAgentPool(Number(params.count));
    if (a === 'SET_AGENT_CONFIG') return svc.registerAgentConfig(targetId, params.config || {});
    if (a === 'TASK_FINALIZE') return svc.finalizeTask(String(params.taskId), String(params.adminUuid || 'ADMIN'), ctx || null);
    if (a === 'TASK_ROLLBACK') return svc.rollbackTask(String(params.taskId), String(params.adminUuid || 'ADMIN'), String(params.reason || 'ROLLBACK'));
    if (a === 'TASK_CANCEL') return svc.cancelTask(String(params.taskId), String(params.adminUuid || 'ADMIN'), String(params.reason || 'CANCEL'));
    if (a === 'TASK_RETRY') return svc.isolationEngine.retryFromDLQ(String(params.taskId), String(params.adminUuid || 'ADMIN'));
    if (a === 'SETTLEMENT_DISPUTE') {
        const { channelId, openedBy, targetNonce, reason } = params;
        if (!channelId) throw new Error('CHANNEL_ID_REQUIRED');
        return svc.settlementEngine.openDispute({ channelId, openedBy: openedBy || 'ADMIN', targetNonce: Number(targetNonce) || 0, reason });
    }
    if (a === 'SETTLEMENT_SLASH') return svc.settlementEngine.slash(params);
    throw new Error('UNKNOWN_ACTION');
};

