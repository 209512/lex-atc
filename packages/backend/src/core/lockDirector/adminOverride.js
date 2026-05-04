const { SYSTEM, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');
const logger = require('../../utils/logger');

const humanOverride = async (director) => {
    const currentHolderUuid = director.atcService.state.holder;
    director.atcService.addLog('ADMIN', '🚨 Emergency override engaged', 'critical', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.SYSTEM, actionKey: LOG_ACTIONS.OVERRIDE });
    
    if (currentHolderUuid && currentHolderUuid !== SYSTEM.ADMIN_HOLDER_ID) {
        const agent = director.atcService.agents.get(currentHolderUuid);
        if (agent) {
            const sid = director.atcService.getShardIdForAgent ? director.atcService.getShardIdForAgent(agent.uuid) : null;
            const shard = sid ? director.atcService.state.shards?.[sid] : null;
            if (director.atcService.treasury && typeof director.atcService.treasury.applySlashing === 'function') {
                director.atcService.treasury.applySlashing(agent, 'ADMIN_INTERVENTION', {
                    shardId: sid,
                    shardEpoch: shard?.epoch,
                    resourceId: shard?.resourceId,
                    fenceToken: shard?.fencingToken
                });
            }
            director.atcService.addLog('ADMIN', `🔨 Slashed ${agent.id} for slow response during override`, 'critical', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.ECONOMY, actionKey: LOG_ACTIONS.OVERRIDE_SLASH });
        }
    }

    const shardIds = director.atcService.getShardIds ? director.atcService.getShardIds() : [];
    for (const sid of shardIds) {
        await director.atcService._bumpEpoch(sid, 'ADMIN_OVERRIDE', null);
    }
    director.atcService.state.overrideSignal = true;
    director.atcService.state.forcedCandidate = null; 
    director.atcService.state.holder = SYSTEM.ADMIN_HOLDER_ID;
    
    director.atcService.emitState();
    return { success: true };
};

const releaseHumanLock = async (director) => {
    logger.info('🔓 [Admin] Releasing Control...');
    director.atcService.addLog('ADMIN', '✅ Manual override released', 'system', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.SYSTEM, actionKey: LOG_ACTIONS.RELEASE });
    director.atcService.state.overrideSignal = false;
    director.atcService.state.holder = null;
    director.atcService.state.fencingToken = null;
    director.atcService.state.forcedCandidate = null;
    const shardIds = director.atcService.getShardIds ? director.atcService.getShardIds() : [];
    for (const sid of shardIds) {
        const shard = director.atcService.state.shards?.[sid];
        if (shard) shard.forcedCandidate = null;
    }
    director.refreshResourceId();
    director.atcService.emitState();
    return { success: true };
};

module.exports = {
    humanOverride,
    releaseHumanLock,
};

