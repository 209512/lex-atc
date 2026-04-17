const { v4: uuidv4 } = require('uuid');
const CONSTANTS = require('../../config/constants');
const ZkProofGenerator = require('../crypto/ZkProofGenerator');
const logger = require('../../utils/logger');

const parseMembers = () => {
    const raw = process.env.GOVERNANCE_MEMBERS_JSON;
    if (!raw) return null;
    try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return null;
        const map = new Map();
        for (const m of arr) {
            const id = String(m?.id || '');
            if (!id) continue;
            const roles = Array.isArray(m?.roles) ? m.roles.map(String) : [];
            map.set(id, { id, roles });
        }
        return map;
    } catch {
        return null;
    }
};

const JobQueue = require('../queue/JobQueue');

class GovernanceEngine {
    constructor(atcService) {
        this.atcService = atcService;
        this.proposals = new Map();
        this.members = parseMembers();
        this.pollRef = null;
    }

    start() {
        if (this.pollRef) return;
        this.pollRef = setInterval(() => {
            this._poll().catch(err => {
                logger.error('[GovernanceEngine] Polling Error:', err.message);
            });
        }, 250);
        if (this.pollRef.unref) this.pollRef.unref();
    }

    stop() {
        if (this.pollRef) clearInterval(this.pollRef);
        this.pollRef = null;
    }

    getPublicState() {
        const list = Array.from(this.proposals.values())
            .sort((a, b) => a.createdAt - b.createdAt)
            .map(p => ({
                id: p.id,
                action: p.action,
                status: p.status,
                approvals: Array.from(p.approvals.values()).map(a => ({ adminId: a.adminId, at: a.at })),
                threshold: p.threshold,
                timelockMs: p.timelockMs,
                executeAfter: p.executeAfter,
                createdAt: p.createdAt,
                executedAt: p.executedAt,
                cancelledAt: p.cancelledAt,
                reason: p.reason || null,
            }));
        return { proposals: list };
    }

    _syncState() {
        if (this.atcService?.state) {
            this.atcService.state.governance = this.getPublicState();
        }
        if (typeof this.atcService?.emitState === 'function') this.atcService.emitState();
    }

    _hasMember(adminId) {
        if (!this.members) return true;
        return this.members.has(String(adminId));
    }

    _shouldAutoExecute() {
        const adminAuthDisabled = String(process.env.ADMIN_AUTH_DISABLED || '').toLowerCase() === 'true';
        return adminAuthDisabled && String(process.env.NODE_ENV || 'development') !== 'production';
    }

    async propose({ adminId, action, params, timelockMs = null, threshold = null, reason = null }) {
        if (!this._hasMember(adminId)) return { success: false, error: 'UNKNOWN_MEMBER' };
        const id = uuidv4();
        const now = Date.now();
        const autoExecute = this._shouldAutoExecute();
        const tl = autoExecute ? 0 : (timelockMs === null ? Number(CONSTANTS.GOVERNANCE_TIMELOCK_MS || 0) : Number(timelockMs));
        const th = autoExecute ? 1 : (threshold === null ? Number(CONSTANTS.GOVERNANCE_APPROVAL_THRESHOLD || 1) : Number(threshold));
        const total = autoExecute ? 1 : Number(CONSTANTS.GOVERNANCE_APPROVAL_TOTAL || th);

        const proposal = {
            id,
            action: String(action),
            params: params || {},
            status: 'PENDING',
            approvals: new Map(),
            threshold: th,
            total,
            timelockMs: tl,
            executeAfter: now + tl,
            createdAt: now,
            executedAt: null,
            cancelledAt: null,
            reason: reason ? String(reason) : null,
        };

        this.proposals.set(id, proposal);
        
        // Run audit asynchronously to prevent blocking the main flow
        this._audit('GOV_PROPOSAL_CREATED', adminId, { proposalId: id, action: proposal.action, params: proposal.params, executeAfter: proposal.executeAfter, threshold: th, timelockMs: tl, reason: proposal.reason }).catch(err => logger.error('[GovernanceEngine] Audit failed:', err));
        
        if (autoExecute) {
            await this.approve({ adminId, proposalId: id });
            const executed = await this.execute({ adminId, proposalId: id });
            this._syncState();
            
            // If execution failed, return success: false
            if (!executed.success) {
                return { success: false, proposalId: id, status: this.proposals.get(id)?.status, error: executed.error };
            }
            
            return { success: true, proposalId: id, status: this.proposals.get(id)?.status || 'EXECUTED', executeAfter: proposal.executeAfter, threshold: th, autoExecuted: true, executed };
        }
        this._syncState();
        return { success: true, proposalId: id, status: proposal.status, executeAfter: proposal.executeAfter, threshold: th };
    }

    async approve({ adminId, proposalId }) {
        if (!this._hasMember(adminId)) return { success: false, error: 'UNKNOWN_MEMBER' };
        const p = this.proposals.get(String(proposalId));
        if (!p) return { success: false, error: 'NOT_FOUND' };
        if (p.status !== 'PENDING' && p.status !== 'READY') return { success: false, error: `BAD_STATUS_${p.status}` };
        if (!p.approvals.has(String(adminId))) {
            p.approvals.set(String(adminId), { adminId: String(adminId), at: Date.now() });
            this._audit('GOV_APPROVED', adminId, { proposalId: p.id, approvals: p.approvals.size, threshold: p.threshold }).catch(err => logger.error('[GovernanceEngine] Audit failed:', err));
        }
        await this._updateReady(p);
        this._syncState();
        return { success: true, proposalId: p.id, approvals: p.approvals.size, status: p.status, idempotent: true };
    }

    async cancel({ adminId, proposalId, reason = 'CANCEL' }) {
        if (!this._hasMember(adminId)) return { success: false, error: 'UNKNOWN_MEMBER' };
        const p = this.proposals.get(String(proposalId));
        if (!p) return { success: false, error: 'NOT_FOUND' };
        if (p.status === 'EXECUTED') return { success: false, error: 'ALREADY_EXECUTED' };
        if (p.status === 'CANCELLED') return { success: true, proposalId: p.id, status: 'CANCELLED', idempotent: true };
        p.status = 'CANCELLED';
        p.cancelledAt = Date.now();
        p.reason = String(reason);
        this._audit('GOV_CANCELLED', adminId, { proposalId: p.id, reason: p.reason }).catch(err => logger.error('[GovernanceEngine] Audit failed:', err));
        this._syncState();
        return { success: true, proposalId: p.id, status: p.status };
    }

    async execute({ adminId, proposalId }) {
        if (!this._hasMember(adminId)) return { success: false, error: 'UNKNOWN_MEMBER' };
        const p = this.proposals.get(String(proposalId));
        if (!p) return { success: false, error: 'NOT_FOUND' };
        if (p.status === 'EXECUTED') return { success: true, proposalId: p.id, status: 'EXECUTED', idempotent: true };
        if (p.status !== 'READY') return { success: false, error: `BAD_STATUS_${p.status}` };
        if (Date.now() < p.executeAfter) return { success: false, error: 'TIMELOCK_PENDING', executeAfter: p.executeAfter };

        let result;
        try {
            result = await this._executeAction(p.action, p.params);
        } catch (error) {
            logger.error(`[GovernanceEngine] Execution failed for proposal ${proposalId}:`, error);
            p.status = 'FAILED';
            p.executedAt = Date.now();
            this._audit('GOV_EXECUTION_FAILED', adminId, {
                proposalId: p.id,
                action: p.action,
                error: String(error?.message || 'UNKNOWN_EXECUTION_ERROR')
            }).catch(err => logger.error(`[GovernanceEngine] Audit failed:`, err));
            this._syncState();
            return { success: false, proposalId: p.id, status: p.status, error: String(error?.message || 'UNKNOWN_EXECUTION_ERROR') };
        }
        p.status = 'EXECUTED';
        p.executedAt = Date.now();
        
        try {
            const { proof, publicInputs, signerPubkey, mode } = await ZkProofGenerator.generateProof(
                { proposalId: p.id, action: p.action, params: p.params, executedAt: p.executedAt }
            );
            if (proof?.length) p.zkProof = Buffer.from(proof).toString('hex');
            if (publicInputs?.length) p.publicInputs = Buffer.from(publicInputs).toString('hex');
            if (signerPubkey?.length) p.proofSignerPubkey = Buffer.from(signerPubkey).toString('hex');
            if (mode) p.proofMode = String(mode);
        } catch (zkErr) {
            logger.error('[GovernanceEngine] ZK Proof generation failed:', zkErr);
        }

        this._audit('GOV_EXECUTED', adminId, { proposalId: p.id, action: p.action, result, zkProof: p.zkProof }).catch(err => logger.error(`[GovernanceEngine] Audit failed:`, err));
        this._syncState();
        return { success: true, proposalId: p.id, status: p.status, result };
    }

    async _updateReady(p) {
        const enough = p.approvals.size >= p.threshold;
        if (enough && p.status === 'PENDING') {
            p.status = 'READY';
            this._audit('GOV_READY', 'SYSTEM', { proposalId: p.id, executeAfter: p.executeAfter, approvals: p.approvals.size, threshold: p.threshold }).catch(err => logger.error('[GovernanceEngine] Audit failed:', err));
        }
    }

    async _poll() {
        if (this.isPolling) return;
        this.isPolling = true;
        try {
            for (const p of this.proposals.values()) {
                if (p.status === 'PENDING') {
                    await this._updateReady(p);
                }
            }
            this._cleanupMemory();
        } catch (e) {
            logger.error('[GovernanceEngine] Polling Error:', e.message);
        } finally {
            this.isPolling = false;
        }
    }

    _cleanupMemory() {
        const now = Date.now();
        const config = this.atcService.config?.governance || {};
        const TTL_MS = config.gcTtlMs || 24 * 60 * 60 * 1000; // 24 hours
        const MAX_ITEMS = config.gcMaxItems || 5000;

        // Cleanup proposals map
        for (const [proposalId, p] of this.proposals.entries()) {
            if (['EXECUTED', 'CANCELLED', 'FAILED'].includes(p.status)) {
                const terminalTime = p.executedAt || p.cancelledAt || p.createdAt;
                if (now - terminalTime > TTL_MS) {
                    this.proposals.delete(proposalId);
                }
            }
        }
        
        // Enforce Hard Limit
        if (this.proposals.size > MAX_ITEMS) {
            const sortedKeys = Array.from(this.proposals.entries())
                .sort((a, b) => a[1].createdAt - b[1].createdAt)
                .map(entry => entry[0]);
            const excess = this.proposals.size - MAX_ITEMS;
            for (let i = 0; i < excess; i++) {
                this.proposals.delete(sortedKeys[i]);
            }
        }
    }

    async _executeAction(action, params) {
        const a = String(action);
        const svc = this.atcService;
        const targetId = String(params.targetId || params.uuid || '');
        
        if (a === 'OVERRIDE') return svc.humanOverride();
        if (a === 'RELEASE') return svc.releaseHumanLock();
        if (a === 'TRANSFER_LOCK') return svc.transferLock(targetId);
        if (a === 'PAUSE_AGENT') return svc.pauseAgent(targetId, Boolean(params.pause));
        if (a === 'TERMINATE_AGENT') return svc.terminateAgent(targetId);
        if (a === 'TOGGLE_STOP') return svc.toggleGlobalStop(Boolean(params.enable));
        if (a === 'SCALE_AGENTS') return svc.updateAgentPool(Number(params.count));
        if (a === 'SET_AGENT_CONFIG') return svc.registerAgentConfig(targetId, params.config || {});
        if (a === 'TASK_FINALIZE') return svc.finalizeTask(String(params.taskId), String(params.adminUuid || 'ADMIN'));
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
    }

    async _audit(action, actorUuid, payload) {
        const shardId = 'RG-0';
        const shardEpoch = this.atcService?.state?.shards?.[shardId]?.epoch ?? 0;
        const resourceId = this.atcService?.state?.shards?.[shardId]?.resourceId ?? null;
        
        JobQueue.add('audit-queue', `audit:${action}`, {
            shardId,
            shardEpoch,
            resourceId,
            fenceToken: null,
            action,
            actorUuid: String(actorUuid),
            correlationId: `gov:${action}:${payload?.proposalId || uuidv4()}`,
            payload: payload || {}
        });
    }

    applyEvent(e) {
        if (!String(e.action || '').startsWith('GOV_')) return;
        const p = e.payload || {};
        const id = String(p.proposalId || '');
        if (!id) return;

        if (e.action === 'GOV_PROPOSAL_CREATED') {
            if (!this.proposals.has(id)) {
                const proposal = {
                    id,
                    action: String(p.action),
                    params: p.params || {},
                    status: 'PENDING',
                    approvals: new Map(),
                    threshold: Number(p.threshold || 1),
                    total: Number(p.total || p.threshold || 1),
                    timelockMs: Number(p.timelockMs || CONSTANTS.GOVERNANCE_TIMELOCK_MS || 0),
                    executeAfter: Number(p.executeAfter || Date.now()),
                    createdAt: e.created_at ? new Date(e.created_at).getTime() : Date.now(),
                    executedAt: null,
                    cancelledAt: null,
                    reason: p.reason || null,
                };
                this.proposals.set(id, proposal);
            }
        }

        const proposal = this.proposals.get(id);
        if (!proposal) return;
        if (e.action === 'GOV_APPROVED') {
            const adminId = String(e.actor_uuid || '');
            if (adminId && !proposal.approvals.has(adminId)) {
                proposal.approvals.set(adminId, { adminId, at: e.created_at ? new Date(e.created_at).getTime() : Date.now() });
            }
        }
        if (e.action === 'GOV_READY') {
            proposal.status = 'READY';
        }
        if (e.action === 'GOV_EXECUTED') {
            proposal.status = 'EXECUTED';
            proposal.executedAt = e.created_at ? new Date(e.created_at).getTime() : Date.now();
        }
        if (e.action === 'GOV_CANCELLED') {
            proposal.status = 'CANCELLED';
            proposal.cancelledAt = e.created_at ? new Date(e.created_at).getTime() : Date.now();
            proposal.reason = p.reason || proposal.reason;
        }
    }
}

module.exports = GovernanceEngine;
