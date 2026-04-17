const { v4: uuidv4 } = require('uuid');
const ExternalSideEffectGuard = require('./ExternalSideEffectGuard');
const MockSandboxAdapter = require('./MockSandboxAdapter');
const DockerSandboxAdapter = require('./DockerSandboxAdapter');
const PooledDockerSandboxAdapter = require('./PooledDockerSandboxAdapter');
const WasmSandboxAdapter = require('./WasmSandboxAdapter');
const TrueWasmSandboxAdapter = require('./TrueWasmSandboxAdapter');
const DeferredExecutionQueue = require('./DeferredExecutionQueue');
const CONSTANTS = require('../../config/constants');
const logger = require('../../utils/logger');

const classifyText = (text) => {
    const t = String(text || '').toLowerCase();
    if (/(http|fetch|webhook|email|smtp|delete|drop|shutdown)/.test(t)) return 'external';
    if (/(payment|stripe|bank|transfer|mint|burn|settle|finalize|commit|irreversible)/.test(t)) return 'irreversible';
    return 'reversible';
};

class IsolationPolicyEngine {
    constructor(atcService) {
        this.atcService = atcService;
        this.guard = new ExternalSideEffectGuard();
        const engine = String(process.env.SANDBOX_ENGINE || 'true_wasm').toLowerCase(); // Default to True Wasm for low latency
        if (process.env.USE_LITE_MODE === 'true' || process.env.NODE_ENV === 'test' || engine === 'mock') {
            this.sandbox = new MockSandboxAdapter(this.guard);
        } else if (engine === 'docker') {
            this.sandbox = new DockerSandboxAdapter(this.guard);
        } else if (engine === 'pooled_docker') {
            this.sandbox = new PooledDockerSandboxAdapter(this.guard);
        } else if (engine === 'wasm') {
            this.sandbox = new WasmSandboxAdapter(this.guard);
        } else {
            this.sandbox = new TrueWasmSandboxAdapter(this.guard);
        }
        this.queue = new DeferredExecutionQueue();
        this.tasks = new Map();
        this.dlq = new Map(); // Dead Letter Queue for failed/timed-out tasks
        this.pollRef = null;
    }

    start() {
        if (this.pollRef) return;
        this.pollRef = setInterval(() => {
            this._poll().catch(err => logger.error('[IsolationPolicyEngine] Poll error:', err));
        }, CONSTANTS.ISOLATION_POLL_INTERVAL_MS);
        if (this.pollRef.unref) this.pollRef.unref();
    }

    stop() {
        if (this.pollRef) clearInterval(this.pollRef);
        this.pollRef = null;
        if (this.sandbox && typeof this.sandbox.shutdown === 'function') {
            this.sandbox.shutdown().catch(() => {});
        }
    }

    getPublicState() {
        const pending = [];
        const tasks = [];

        let waitingAdmin = 0;
        let inProgress = 0;
        let failed = 0;

        for (const t of this.tasks.values()) {
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
        
        const dlqTasks = Array.from(this.dlq.values()).map(item => ({
            taskId: item.task.taskId,
            error: item.error,
            failedAt: item.failedAt
        })).sort((a, b) => b.failedAt - a.failedAt);

        return {
            pending,
            tasks: tasks.slice(0, 200),
            dlq: dlqTasks.slice(0, 100),
            summary: { waitingAdmin, inProgress, failed, dlqCount: this.dlq.size },
        };
    }

    async createIntent({ actorUuid, shardId, shardEpoch, resourceId, fenceToken, text, context = {} }) {
        const taskId = uuidv4();
        const classification = context.classification || classifyText(text);
        const requiresFinalization = true;
        const createdAt = Date.now();
        const timeoutAt = createdAt + Number(CONSTANTS.ISOLATION_TASK_TIMEOUT_MS || 0);

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
            intent: { text: String(text || '') },
            createdAt,
            timeoutAt,
            executedAt: null,
            rolledBackAt: null,
            finalizedAt: null,
            lastError: null,
        };

        this.tasks.set(taskId, task);

        await this._record(task, 'TASK_INTENT_CREATED', 'PENDING', { classification, requiresFinalization, intent: task.intent });

        this.queue.add(task);
        await this._record(task, 'TASK_EXECUTION_DEFERRED', 'PENDING', { timeoutAt });
        return { taskId, status: 'PENDING', classification, timeoutAt };
    }

    async finalize(taskId, adminUuid = 'ADMIN') {
        const task = this.tasks.get(taskId);
        if (!task) return { success: false, error: 'Task not found' };
        if (task.status === 'EXECUTED') return { success: true, taskId, status: 'EXECUTED', idempotent: true };
        if (task.status === 'ROLLED_BACK' || task.status === 'CANCELLED' || task.status === 'TIMED_OUT') {
            return { success: false, error: `Task is ${task.status}` };
        }

        if (task.classification === 'irreversible') {
            try {
                if (this.atcService?.settlementEngine?.ensureFinalizedForAgent) {
                    await this.atcService.settlementEngine.ensureFinalizedForAgent(task.actorUuid, {
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
                await this._record(task, 'TASK_FINALIZE_BLOCKED', 'PENDING', { error: task.lastError, adminUuid: String(adminUuid) });
                return { success: false, taskId, status: 'PENDING', error: 'L3_NOT_FINALIZED' };
            }
        }

        if (task.status !== 'FINALIZED') {
            task.status = 'FINALIZED';
            task.finalizedAt = Date.now();
            await this._record(task, 'TASK_FINALIZED', 'FINALIZED', { adminUuid: String(adminUuid) });
        }

        try {
            const exec = await this.sandbox.execute(task);
            task.executedAt = Date.now();
            task.status = 'EXECUTED';
            this.queue.remove(taskId);
            await this._record(task, 'TASK_EXECUTED', 'EXECUTED', { result: exec });
            
            // Try to sync agent status if it exists
            try {
                const agent = this.atcService?.agents?.get(task.actorUuid);
                if (agent && typeof agent.updateStatus === 'function') {
                    await agent.updateStatus();
                }
            } catch (e) {
                logger.warn(`[IsolationPolicyEngine] Failed to update agent status after execute: ${e.message}`);
            }

            if (this.atcService?.settlementEngine?.onTaskExecuted) {
                await this.atcService.settlementEngine.onTaskExecuted(task, exec).catch(err => {
                    logger.error(`[IsolationPolicyEngine] Settlement hook failed for task ${taskId}:`, err);
                });
            }
            return { success: true, taskId, status: 'EXECUTED' };
        } catch (err) {
            logger.error(`[IsolationPolicyEngine] Finalize Sandbox execution failed for task ${taskId}:`, err);
            task.status = 'FAILED';
            task.lastError = err.message;
            this.queue.remove(taskId);
            this.dlq.set(taskId, { task, error: err.message, failedAt: Date.now() });
            await this._record(task, 'TASK_FAILED', 'FAILED', { error: err.message, adminUuid: String(adminUuid) });
            return { success: false, taskId, status: 'FAILED', error: err.message };
        }
    }

    async rollback(taskId, adminUuid = 'ADMIN', reason = 'ROLLBACK') {
        const task = this.tasks.get(taskId);
        if (!task) return { success: false, error: 'Task not found' };
        if (task.status === 'ROLLED_BACK') return { success: true, taskId, status: 'ROLLED_BACK', idempotent: true };
        if (task.status === 'CANCELLED' || task.status === 'TIMED_OUT') return { success: false, error: `Task is ${task.status}` };

        if (task.status === 'EXECUTED') {
            try {
                const comp = await this.sandbox.compensate(task);
                await this._record(task, 'TASK_COMPENSATED', 'COMPENSATED', { result: comp, adminUuid: String(adminUuid) });
            } catch (err) {
                logger.error(`[IsolationPolicyEngine] Rollback compensation failed for task ${taskId}:`, err);
                return { success: false, taskId, status: 'FAILED', error: err.message };
            }
        }

        task.status = 'ROLLED_BACK';
        task.rolledBackAt = Date.now();
        this.queue.remove(taskId);
        this.dlq.delete(taskId);
        await this._record(task, 'TASK_ROLLED_BACK', 'ROLLED_BACK', { adminUuid: String(adminUuid), reason });
        return { success: true, taskId, status: 'ROLLED_BACK' };
    }

    async cancel(taskId, adminUuid = 'ADMIN', reason = 'CANCEL') {
        const task = this.tasks.get(taskId);
        if (!task) return { success: false, error: 'Task not found' };
        if (task.status === 'CANCELLED') return { success: true, taskId, status: 'CANCELLED', idempotent: true };
        if (task.status === 'EXECUTED') return { success: false, error: 'Cannot cancel executed task' };

        task.status = 'CANCELLED';
        this.queue.remove(taskId);
        this.dlq.delete(taskId);
        await this._record(task, 'TASK_CANCELLED', 'CANCELLED', { adminUuid: String(adminUuid), reason });
        return { success: true, taskId, status: 'CANCELLED' };
    }

    async retryFromDLQ(taskId, adminUuid = 'ADMIN') {
        const item = this.dlq.get(taskId);
        if (!item) return { success: false, error: 'Task not found in DLQ' };
        
        const task = item.task;
        this.dlq.delete(taskId);
        
        // Reset status to allow retry
        task.status = 'PENDING';
        task.lastError = null;

        task.timeoutAt = Date.now() + Number(CONSTANTS.ISOLATION_TASK_TIMEOUT_MS || 0);
        this.queue.add(task);
        await this._record(task, 'TASK_RETRY_DEFERRED', 'PENDING', { timeoutAt: task.timeoutAt, adminUuid: String(adminUuid) });
        return { success: true, taskId, status: 'PENDING' };
    }

    applyEvent(e) {
        const payload = e.payload || {};
        const taskId = payload.taskId;
        if (!taskId) return;

        if (!this.tasks.has(taskId)) {
            this.tasks.set(taskId, {
                taskId,
                actorUuid: String(e.actor_uuid || payload.actorUuid || ''),
                shardId: String(e.shard_id || payload.shardId || ''),
                shardEpoch: Number(e.shard_epoch || payload.shardEpoch || 0),
                resourceId: e.resource_id || payload.resourceId || null,
                fenceToken: e.fence_token || payload.fenceToken || null,
                classification: payload.classification || 'reversible',
                requiresFinalization: payload.requiresFinalization ?? true,
                status: 'PENDING',
                intent: payload.intent || { text: '' },
                createdAt: Date.now(),
                timeoutAt: Date.now(),
                executedAt: null,
                rolledBackAt: null,
                finalizedAt: null,
                lastError: null,
            });
        }

        const t = this.tasks.get(taskId);
        if (e.action === 'TASK_EXECUTION_DEFERRED') {
            t.status = 'PENDING';
            t.timeoutAt = Number(payload.timeoutAt || t.timeoutAt);
            this.queue.add(t);
        }
        if (e.action === 'TASK_FINALIZED') {
            t.status = 'FINALIZED';
            this.queue.add(t);
        }
        if (e.action === 'TASK_EXECUTED') {
            t.status = 'EXECUTED';
            this.queue.remove(taskId);
        }
        if (e.action === 'TASK_ROLLED_BACK' || e.action === 'TASK_CANCELLED' || e.action === 'TASK_TIMEOUT') {
            t.status = e.action === 'TASK_TIMEOUT' ? 'TIMED_OUT' : (e.action === 'TASK_CANCELLED' ? 'CANCELLED' : 'ROLLED_BACK');
            this.queue.remove(taskId);
        }
    }

    async _poll() {
        if (this.isPolling) return;
        this.isPolling = true;
        try {
            const due = this.queue.due(Number(CONSTANTS.ISOLATION_TASK_TIMEOUT_MS || 0));
            for (const t of due) {
                if (t.status !== 'PENDING') continue;
                t.status = 'TIMED_OUT';
                this.queue.remove(t.taskId);
                this.dlq.set(t.taskId, { task: t, error: 'TIMED_OUT', failedAt: Date.now() });
                await this._record(t, 'TASK_TIMEOUT', 'TIMED_OUT', { timeoutAt: t.timeoutAt });
            }
            this._cleanupMemory();
        } catch (e) {
            logger.error('[IsolationPolicyEngine] Polling Error:', e.message);
        } finally {
            this.isPolling = false;
        }
    }

    _cleanupMemory() {
        const now = Date.now();
        const config = this.atcService.config?.isolation || {};
        const TTL_MS = config.gcTtlMs || 24 * 60 * 60 * 1000; // 24 hours
        const MAX_ITEMS = config.gcMaxItems || 5000;

        // Cleanup tasks map
        for (const [taskId, t] of this.tasks.entries()) {
            if (['EXECUTED', 'ROLLED_BACK', 'CANCELLED', 'TIMED_OUT'].includes(t.status)) {
                const terminalTime = t.executedAt || t.rolledBackAt || t.timeoutAt || t.createdAt;
                if (now - terminalTime > TTL_MS) {
                    this.tasks.delete(taskId);
                }
            }
        }
        
        // Enforce Hard Limit for tasks
        if (this.tasks.size > MAX_ITEMS) {
            const sortedKeys = Array.from(this.tasks.entries())
                .sort((a, b) => a[1].createdAt - b[1].createdAt)
                .map(entry => entry[0]);
            const excess = this.tasks.size - MAX_ITEMS;
            for (let i = 0; i < excess; i++) {
                this.tasks.delete(sortedKeys[i]);
            }
        }

        // Cleanup DLQ map
        for (const [taskId, item] of this.dlq.entries()) {
            if (now - item.failedAt > TTL_MS) {
                this.dlq.delete(taskId);
            }
        }
        
        // Enforce Hard Limit for DLQ
        if (this.dlq.size > MAX_ITEMS) {
            const sortedKeys = Array.from(this.dlq.entries())
                .sort((a, b) => a[1].failedAt - b[1].failedAt)
                .map(entry => entry[0]);
            const excess = this.dlq.size - MAX_ITEMS;
            for (let i = 0; i < excess; i++) {
                this.dlq.delete(sortedKeys[i]);
            }
        }
    }

    async _record(task, action, isolationState, extraPayload = {}) {
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

        await this.atcService.recordEvent({
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

        if (this.atcService.state) {
            this.atcService.state.isolation = this.getPublicState();
        }
        if (typeof this.atcService.emitState === 'function') this.atcService.emitState();
    }
}

module.exports = IsolationPolicyEngine;
