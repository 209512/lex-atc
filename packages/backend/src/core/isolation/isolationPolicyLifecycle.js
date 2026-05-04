const { v4: uuidv4 } = require('uuid');
const promClient = require('prom-client');
const CONSTANTS = require('../../config/constants');
const logger = require('../../utils/logger');
const { SandboxIntentSchema, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');
const { resolveSandboxCommandWithContext } = require('./SandboxCommandRegistry');
const record = require('./isolationPolicyRecord');
const { classifyText } = require('./isolationPolicyUtils');

const getDenialsMetric = () => {
    const existing = promClient.register.getSingleMetric('lex_atc_sandbox_policy_denials_total');
    return existing || new promClient.Counter({
        name: 'lex_atc_sandbox_policy_denials_total',
        help: 'Count of sandbox policy denials',
        labelNames: ['reason', 'command_key']
    });
};

const createIntent = async (engine, { actorUuid, shardId, shardEpoch, resourceId, fenceToken, text, context = {} }) => {
    const taskId = uuidv4();
    const classification = context.classification || classifyText(text);
    const requiresFinalization = true;
    const createdAt = Date.now();
    const timeoutAt = createdAt + Number(CONSTANTS.ISOLATION_TASK_TIMEOUT_MS || 0);

    const rawText = String(text || '');
    const intent = { text: rawText, commandKey: 'ECHO', args: [rawText] };
    const parsedIntent = SandboxIntentSchema.safeParse(intent);
    const finalIntent = parsedIntent.success ? parsedIntent.data : { text: rawText };

    const task = {
        taskId,
        actorUuid: String(actorUuid),
        shardId: String(shardId),
        shardEpoch: Number(shardEpoch),
        resourceId: resourceId || null,
        fenceToken: fenceToken || null,
        classification,
        requiresFinalization,
        status: 'PENDING',
        intent: finalIntent,
        createdAt,
        timeoutAt,
        executedAt: null,
        rolledBackAt: null,
        finalizedAt: null,
        lastError: null,
    };

    engine.tasks.set(taskId, task);
    await record(engine, task, 'TASK_INTENT_CREATED', 'PENDING', { classification, requiresFinalization, intent: task.intent });

    engine.queue.add(task);
    await record(engine, task, 'TASK_EXECUTION_DEFERRED', 'PENDING', { timeoutAt });
    return { taskId, status: 'PENDING', classification, timeoutAt };
};

const finalize = async (engine, taskId, adminUuid = 'ADMIN', ctx = null) => {
    const task = engine.tasks.get(taskId);
    if (!task) return { success: false, error: 'Task not found' };
    if (task.status === 'EXECUTED') return { success: true, taskId, status: 'EXECUTED', idempotent: true };
    if (task.status === 'ROLLED_BACK' || task.status === 'CANCELLED' || task.status === 'TIMED_OUT') {
        return { success: false, error: `Task is ${task.status}` };
    }

    if (task.classification === 'irreversible') {
        try {
            if (engine.atcService?.settlementEngine?.ensureFinalizedForAgent) {
                await engine.atcService.settlementEngine.ensureFinalizedForAgent(task.actorUuid, {
                    shardId: task.shardId,
                    shardEpoch: task.shardEpoch,
                    resourceId: task.resourceId,
                    fenceToken: task.fenceToken,
                    taskId: task.taskId
                });
            } else {
                throw new Error('SETTLEMENT_ENGINE_MISSING');
            }
        } catch (err) {
            task.lastError = String(err?.message || err);
            await record(engine, task, 'TASK_FINALIZE_BLOCKED', 'PENDING', { error: task.lastError, adminUuid: String(adminUuid) });
            return { success: false, taskId, status: 'PENDING', error: 'L3_NOT_FINALIZED' };
        }
    }

    let commandPlan = null;
    if (task.status !== 'FINALIZED') {
        task.status = 'FINALIZED';
        task.finalizedAt = Date.now();
        if (task.classification !== 'reversible') {
            try {
                const nodeEnv = String(process.env.NODE_ENV || 'development');
                const effectiveCtx = ctx || (nodeEnv === 'production' ? null : { executorId: String(adminUuid || 'ADMIN'), executorRoles: ['root'] });
                commandPlan = resolveSandboxCommandWithContext(task, effectiveCtx);
                task.execContext = effectiveCtx;
            } catch (err) {
                task.status = 'PENDING';
                task.finalizedAt = null;
                task.lastError = String(err?.message || err);
                const reason = task.lastError;
                const commandKey = String(task?.intent?.commandKey || '').toUpperCase() || 'UNKNOWN';
                if (reason.startsWith('SANDBOX_')) {
                    const denials = getDenialsMetric();
                    denials.labels(reason, commandKey).inc(1);
                    if (engine.atcService?.addLog) {
                        engine.atcService.addLog('SYSTEM', `Sandbox policy denied finalize: ${reason} (task=${taskId}, cmd=${commandKey})`, 'critical');
                    }
                    if (engine.atcService?.recordEvent) {
                        engine.atcService.recordEvent({
                            shardId: task.shardId || 'RG-0',
                            shardEpoch: Number(task.shardEpoch ?? 0),
                            resourceId: task.resourceId || null,
                            fenceToken: task.fenceToken || null,
                            action: 'SANDBOX_POLICY_DENIED',
                            actorUuid: String(adminUuid || 'ADMIN'),
                            correlationId: `sandbox:deny:${taskId}:${Date.now()}`,
                            payload: { taskId, commandKey, reason, executorId: ctx?.executorId || null }
                        }).catch(() => {});
                    }
                }
                await record(engine, task, 'TASK_FINALIZE_BLOCKED', 'PENDING', { error: task.lastError, adminUuid: String(adminUuid) });
                return { success: false, taskId, status: 'PENDING', error: task.lastError };
            }
        }
        await record(engine, task, 'TASK_FINALIZED', 'FINALIZED', { adminUuid: String(adminUuid), command: commandPlan });
    }

    try {
        const exec = await engine.sandbox.execute(task);
        task.executedAt = Date.now();
        task.status = 'EXECUTED';
        engine.queue.remove(taskId);
        if (!commandPlan && task.classification !== 'reversible') {
            try { commandPlan = resolveSandboxCommandWithContext(task, ctx || null); } catch (e) { void e; }
        }
        await record(engine, task, 'TASK_EXECUTED', 'EXECUTED', { result: exec, command: commandPlan });

        try {
            const agent = engine.atcService?.agents?.get(task.actorUuid);
            if (agent && typeof agent.updateStatus === 'function') {
                await agent.updateStatus();
            }
        } catch (e) {
            logger.warn(`[IsolationPolicyEngine] Failed to update agent status after execute: ${e.message}`);
        }

        if (engine.atcService?.settlementEngine?.onTaskExecuted) {
            await engine.atcService.settlementEngine.onTaskExecuted(task, exec).catch(err => {
                logger.error(`[IsolationPolicyEngine] Settlement hook failed for task ${taskId}:`, err);
            });
        }
        return { success: true, taskId, status: 'EXECUTED' };
    } catch (err) {
        logger.error(`[IsolationPolicyEngine] Finalize Sandbox execution failed for task ${taskId}:`, err);
        task.status = 'FAILED';
        task.lastError = err.message;
        engine.queue.remove(taskId);
        engine.dlq.set(taskId, { task, error: err.message, failedAt: Date.now() });
        await record(engine, task, 'TASK_FAILED', 'FAILED', { error: err.message, adminUuid: String(adminUuid) });
        return { success: false, taskId, status: 'FAILED', error: err.message };
    }
};

const rollback = async (engine, taskId, adminUuid = 'ADMIN', reason = 'ROLLBACK') => {
    const task = engine.tasks.get(taskId);
    if (!task) return { success: false, error: 'Task not found' };
    if (task.status === 'ROLLED_BACK') return { success: true, taskId, status: 'ROLLED_BACK', idempotent: true };
    if (task.status === 'CANCELLED' || task.status === 'TIMED_OUT') return { success: false, error: `Task is ${task.status}` };

    if (task.status === 'EXECUTED') {
        try {
            const comp = await engine.sandbox.compensate(task);
            await record(engine, task, 'TASK_COMPENSATED', 'COMPENSATED', { result: comp, adminUuid: String(adminUuid) });
        } catch (err) {
            logger.error(`[IsolationPolicyEngine] Rollback compensation failed for task ${taskId}:`, err);
            return { success: false, taskId, status: 'FAILED', error: err.message };
        }
    }

    task.status = 'ROLLED_BACK';
    task.rolledBackAt = Date.now();
    engine.queue.remove(taskId);
    engine.dlq.delete(taskId);
    await record(engine, task, 'TASK_ROLLED_BACK', 'ROLLED_BACK', { adminUuid: String(adminUuid), reason });
    return { success: true, taskId, status: 'ROLLED_BACK' };
};

const cancel = async (engine, taskId, adminUuid = 'ADMIN', reason = 'CANCEL') => {
    const task = engine.tasks.get(taskId);
    if (!task) return { success: false, error: 'Task not found' };
    if (task.status === 'CANCELLED') return { success: true, taskId, status: 'CANCELLED', idempotent: true };
    if (task.status === 'EXECUTED') return { success: false, error: 'Cannot cancel executed task' };

    task.status = 'CANCELLED';
    engine.queue.remove(taskId);
    engine.dlq.delete(taskId);
    await record(engine, task, 'TASK_CANCELLED', 'CANCELLED', { adminUuid: String(adminUuid), reason });
    return { success: true, taskId, status: 'CANCELLED' };
};

const retryFromDLQ = async (engine, taskId, adminUuid = 'ADMIN') => {
    const item = engine.dlq.get(taskId);
    if (!item) return { success: false, error: 'Task not found in DLQ' };

    const task = item.task;
    engine.dlq.delete(taskId);

    task.status = 'PENDING';
    task.lastError = null;
    task.timeoutAt = Date.now() + Number(CONSTANTS.ISOLATION_TASK_TIMEOUT_MS || 0);
    engine.queue.add(task);
    await record(engine, task, 'TASK_RETRY_DEFERRED', 'PENDING', { timeoutAt: task.timeoutAt, adminUuid: String(adminUuid) });
    return { success: true, taskId, status: 'PENDING' };
};

const addSandboxDenialLog = (engine, reason, commandKey, taskId, adminUuid) => {
    if (!engine.atcService?.addLog) return;
    engine.atcService.addLog('SYSTEM', `Sandbox policy denied finalize: ${reason} (task=${taskId}, cmd=${commandKey})`, 'critical', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.ISOLATION, actionKey: LOG_ACTIONS.TASK_FINALIZE, actorUuid: String(adminUuid) });
};

module.exports = {
    createIntent,
    finalize,
    rollback,
    cancel,
    retryFromDLQ,
    addSandboxDenialLog,
};

