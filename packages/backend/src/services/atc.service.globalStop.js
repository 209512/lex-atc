const CONSTANTS = require('../config/constants');
const { LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');

const toggleGlobalStop = async (svc, enable) => {
    const next = Boolean(enable);

    if (svc.sharedClient && typeof svc.sharedClient.getCPSubsystem === 'function') {
        const cp = svc.sharedClient.getCPSubsystem();
        const lock = await cp.getLock(CONSTANTS.GLOBAL_STOP_LOCK_NAME);
        if (next) {
            if (!svc._globalStopFence) {
                const fence = await lock.tryLock(250);
                if (!fence) throw new Error('GLOBAL_STOP_LOCK_ACQUIRE_FAILED');
                svc._globalStopLock = lock;
                svc._globalStopFence = fence;
            }
        } else {
            if (svc._globalStopLock && svc._globalStopFence) {
                await svc._globalStopLock.unlock(svc._globalStopFence).catch(() => {});
            }
            svc._globalStopLock = null;
            svc._globalStopFence = null;
        }
    }

    svc.state.globalStop = next;
    if (next && svc.stateManager?.bumpEpoch) {
        const shardIds = svc.getShardIds();
        for (const shardId of shardIds) {
            await svc.stateManager.bumpEpoch(shardId, 'GLOBAL_STOP', null);
        }
    }

    svc.addLog('SYSTEM', `Global stop ${next ? 'Enabled' : 'Disabled'}`, 'system', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.SYSTEM, actionKey: LOG_ACTIONS.TOGGLE_STOP });
    svc.emitState();
    return { success: true, globalStop: next };
};

module.exports = { toggleGlobalStop };
