const CONSTANTS = require('../config/constants');
const logger = require('../utils/logger');
const ReputationEngine = require('./ReputationEngine');
const { LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');

async function handleError(agent, err) {
    agent.errorCount += 1;
    agent.stats.totalTasks += 1;
    agent.account.reputation = ReputationEngine.calculate(agent.account, agent.stats);
    agent.log(`⚠️ Runtime Error (${agent.errorCount}): ${err.message}`, 'warn', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.TASK_FINALIZE });
    await agent.updateStatus('ERROR', CONSTANTS.RESOURCE_NONE, `FAULT_${err.message}`);

    if (agent.currentLock && agent.currentFence) {
        try {
            await agent.currentLock.unlock(agent.currentFence);
        } catch (e) {
            logger.error(`[Agent ${agent.uuid}] Failed to unlock during error handling:`, e.message);
        }
        agent.currentLock = null;
        agent.currentFence = null;
    }
    await agent._delay(CONSTANTS.AGENT_ERROR_DELAY || 1000);
}

module.exports = {
    handleError,
};

