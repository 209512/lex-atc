const CONSTANTS = require('../../config/constants');
const logger = require('../../utils/logger');
const record = require('./isolationPolicyRecord');

const cleanupMemory = (engine) => {
    const now = Date.now();
    const config = engine.atcService.config?.isolation || {};
    const TTL_MS = config.gcTtlMs || 24 * 60 * 60 * 1000;
    const MAX_ITEMS = config.gcMaxItems || 5000;

    for (const [taskId, t] of engine.tasks.entries()) {
        if (['EXECUTED', 'ROLLED_BACK', 'CANCELLED', 'TIMED_OUT'].includes(t.status)) {
            const terminalTime = t.executedAt || t.rolledBackAt || t.timeoutAt || t.createdAt;
            if (now - terminalTime > TTL_MS) {
                engine.tasks.delete(taskId);
            }
        }
    }

    if (engine.tasks.size > MAX_ITEMS) {
        const sortedKeys = Array.from(engine.tasks.entries())
            .sort((a, b) => a[1].createdAt - b[1].createdAt)
            .map(entry => entry[0]);
        const excess = engine.tasks.size - MAX_ITEMS;
        for (let i = 0; i < excess; i++) {
            engine.tasks.delete(sortedKeys[i]);
        }
    }

    for (const [taskId, item] of engine.dlq.entries()) {
        if (now - item.failedAt > TTL_MS) {
            engine.dlq.delete(taskId);
        }
    }

    if (engine.dlq.size > MAX_ITEMS) {
        const sortedKeys = Array.from(engine.dlq.entries())
            .sort((a, b) => a[1].failedAt - b[1].failedAt)
            .map(entry => entry[0]);
        const excess = engine.dlq.size - MAX_ITEMS;
        for (let i = 0; i < excess; i++) {
            engine.dlq.delete(sortedKeys[i]);
        }
    }
};

const poll = async (engine) => {
    if (engine.isPolling) return;
    engine.isPolling = true;
    try {
        const due = engine.queue.due(Number(CONSTANTS.ISOLATION_TASK_TIMEOUT_MS || 0));
        for (const t of due) {
            if (t.status !== 'PENDING') continue;
            t.status = 'TIMED_OUT';
            engine.queue.remove(t.taskId);
            engine.dlq.set(t.taskId, { task: t, error: 'TIMED_OUT', failedAt: Date.now() });
            await record(engine, t, 'TASK_TIMEOUT', 'TIMED_OUT', { timeoutAt: t.timeoutAt });
        }
        cleanupMemory(engine);
    } catch (e) {
        logger.error('[IsolationPolicyEngine] Polling Error:', e.message);
    } finally {
        engine.isPolling = false;
    }
};

module.exports = { poll, cleanupMemory };

