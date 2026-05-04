const ExternalSideEffectGuard = require('./ExternalSideEffectGuard');
const MockSandboxAdapter = require('./MockSandboxAdapter');
const DockerSandboxAdapter = require('./DockerSandboxAdapter');
const PooledDockerSandboxAdapter = require('./PooledDockerSandboxAdapter');
const WasmSandboxAdapter = require('./WasmSandboxAdapter');
const TrueWasmSandboxAdapter = require('./TrueWasmSandboxAdapter');
const DeferredExecutionQueue = require('./DeferredExecutionQueue');
const CONSTANTS = require('../../config/constants');
const logger = require('../../utils/logger');
const getPublicState = require('./isolationPolicyPublicState');
const record = require('./isolationPolicyRecord');
const { poll } = require('./isolationPolicyPoll');
const lifecycle = require('./isolationPolicyLifecycle');
const applyEvent = require('./isolationPolicyEvents');

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
        return getPublicState(this);
    }

    async createIntent({ actorUuid, shardId, shardEpoch, resourceId, fenceToken, text, context = {} }) {
        return lifecycle.createIntent(this, { actorUuid, shardId, shardEpoch, resourceId, fenceToken, text, context });
    }

    async finalize(taskId, adminUuid = 'ADMIN', ctx = null) {
        return lifecycle.finalize(this, taskId, adminUuid, ctx);
    }

    async rollback(taskId, adminUuid = 'ADMIN', reason = 'ROLLBACK') {
        return lifecycle.rollback(this, taskId, adminUuid, reason);
    }

    async cancel(taskId, adminUuid = 'ADMIN', reason = 'CANCEL') {
        return lifecycle.cancel(this, taskId, adminUuid, reason);
    }

    async retryFromDLQ(taskId, adminUuid = 'ADMIN') {
        return lifecycle.retryFromDLQ(this, taskId, adminUuid);
    }

    applyEvent(e) {
        return applyEvent(this, e);
    }

    async _poll() {
        return poll(this);
    }

    _cleanupMemory() {
        return;
    }

    async _record(task, action, isolationState, extraPayload = {}) {
        return record(this, task, action, isolationState, extraPayload);
    }
}

module.exports = IsolationPolicyEngine;
