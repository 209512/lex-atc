const { v4: uuidv4 } = require('uuid');
const CONSTANTS = require('../config/constants');
const ReputationEngine = require('./ReputationEngine');
const { LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');

async function executeTask(agent, isTarget) {
    const startTime = Date.now();
    agent.stats.totalTasks += 1;
    await agent.updateStatus(CONSTANTS.STATUS_ACTIVE, agent.eventBus.state.resourceId, "AI_THINKING");

    const systemInstruction = agent.config.systemPrompt || `You are a tactical ATC Agent [${agent.id}].`;
    const prompt = isTarget ? "EMERGENCY OVERRIDE: Plan?" : "Describe task in 15 words.";

    try {
        agent.log(`🧠 AI Processing (${agent.config.provider || 'mock'})...`, 'info', { stage: LOG_STAGES.REQUEST, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.TASK_FINALIZE });

        let timeoutId;
        const abortController = new AbortController();
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                abortController.abort();
                reject(new Error('AI_TIMEOUT'));
            }, CONSTANTS.AGENT_AI_TIMEOUT || 12000);
        });
        const aiResponse = await Promise.race([
            agent.provider.generateResponse(prompt, systemInstruction, abortController.signal),
            timeoutPromise
        ]);
        clearTimeout(timeoutId);

        if (!aiResponse || aiResponse.length < 5) throw new Error('EMPTY_PAYLOAD');

        if (agent.eventBus?.isolationEngine && agent.currentContext) {
            const shardId = agent.currentContext.shardId;
            const shardEpoch = agent.currentContext.shardEpoch;
            const resourceId = agent.currentContext.resourceId;
            const fenceToken = agent.currentContext.fenceToken;

            if (agent.eventBus.lockDirector && typeof agent.eventBus.lockDirector.verifyFencingToken === 'function') {
                if (!agent.eventBus.lockDirector.verifyFencingToken(shardId, fenceToken)) {
                    throw new Error('FENCING_TOKEN_VIOLATION');
                }
            }

            const ctx = {
                classification: agent.config.isolationClass || null
            };

            const res = await agent.eventBus.isolationEngine.createIntent({
                actorUuid: agent.uuid,
                shardId,
                shardEpoch,
                resourceId,
                fenceToken,
                text: aiResponse,
                context: ctx
            });

            if (res.status === 'PENDING') {
                agent.log(`⏳ Deferred Task: ${res.taskId}`, 'policy', { stage: LOG_STAGES.ACCEPTED, domain: LOG_DOMAINS.ISOLATION, actionKey: LOG_ACTIONS.TASK_FINALIZE });
            } else {
                agent.log(`✅ Task Executed: ${res.taskId}`, 'success', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.ISOLATION, actionKey: LOG_ACTIONS.TASK_FINALIZE });
            }
        }

        const elapsed = Date.now() - startTime;
        agent.stats.successCount += 1;
        agent.stats.avgAiLatency = (agent.stats.avgAiLatency * 0.8) + (elapsed * 0.2);

        agent.account.reputation = ReputationEngine.calculate(agent.account, agent.stats);
        agent.account.lastWorkHash = `0x${uuidv4().replace(/-/g, '').slice(0, 16)}`;

        agent.log(`📝 [Result]: ${aiResponse}`, 'success', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.TASK_FINALIZE });
        await agent.updateStatus(null, null, "TASK_COMPLETED");

        const minTime = CONSTANTS.AGENT_MIN_TASK_TIME || 1500;
        if (elapsed < minTime) {
            await agent._delay(minTime - elapsed);
        }
    } catch (err) {
        const reason = err.message;
        agent.log(`❌ AI Execution Error: ${reason}`, 'critical', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.AGENT, actionKey: LOG_ACTIONS.TASK_FINALIZE });
        if (agent.eventBus.treasury) agent.eventBus.treasury.applySlashing(agent, reason, agent.currentContext);

        agent.account.reputation = ReputationEngine.calculate(agent.account, agent.stats);
        await agent.updateStatus(null, null, "SLASHED");
        await agent._delay(CONSTANTS.AGENT_SLASHED_DELAY || 2000);
    }

    if (isTarget) {
        agent.eventBus.emitState();
    }
}

module.exports = {
    executeTask,
};

