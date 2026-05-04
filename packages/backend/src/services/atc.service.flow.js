const { LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');

const handleAgentCollision = (svc) => {
    svc.state.collisionCount++;
    svc.addLog('NETWORK', `⚠️ Collision detected!`, 'warn', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_ACQUIRED });
    svc.emitState();
};

const handlePriorityCollision = (svc) => {
    svc.state.collisionCount++;
    svc.state.priorityCollisionTrigger = Date.now();
    svc.addLog('POLICY', `🚨 Priority Contention`, 'policy', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_ACQUIRED });
    svc.emitState();
};

const handleAgentWaiting = (svc, { id }) => {
    const uuid = id;
    const currentHolder = svc.state.holder;
    const pList = svc.state.priorityAgents || [];

    if (currentHolder && currentHolder !== uuid) {
        const holderAgent = svc.agents.get(currentHolder);
        const holderName = holderAgent ? holderAgent.id : (currentHolder === 'Human (Admin)' ? 'ADMIN' : currentHolder);

        if (pList.includes(currentHolder) && !pList.includes(uuid)) {
            svc.addLog(uuid, `🚫 BLOCKED_BY: [${holderName}]`, 'policy', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_BLOCKED });
            handlePriorityCollision(svc);
        } 
        else {
            if (!(svc.state.waitingAgents || []).includes(uuid)) {
               svc.addLog(uuid, `⚔️ WAIT_FOR: [${holderName}]`, 'warn', { stage: LOG_STAGES.REQUEST, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_WAIT });
            }
        }
    }

    if (!(svc.state.waitingAgents || []).includes(uuid)) {
        svc.addLog(uuid, `⏳ Waiting in queue...`, 'info', { stage: LOG_STAGES.REQUEST, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_WAIT });
        if (!svc.state.waitingAgents) svc.state.waitingAgents = [];
        svc.state.waitingAgents.push(uuid);
        svc.emitState();
    }
};

module.exports = {
    handleAgentWaiting,
    handleAgentCollision,
    handlePriorityCollision,
};
