const { v4: uuidv4 } = require('uuid');
const CONSTANTS = require('../../config/constants');
const ZkProofGenerator = require('../crypto/ZkProofGenerator');
const logger = require('../../utils/logger');
const { parseMembers, hasMember } = require('./governanceMembers');
const executeAction = require('./governanceActions');
const audit = require('./governanceAudit');
const { poll, updateReady } = require('./governanceMaintenance');
const applyEvent = require('./governanceEvents');

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
        return hasMember(this, adminId);
    }

    _shouldAutoExecute() {
        const nodeEnv = String(process.env.NODE_ENV || 'development');
        const adminAuthDisabled =
            nodeEnv !== 'production' &&
            String(process.env.ADMIN_AUTH_DISABLED || '').toLowerCase() === 'true' &&
            String(process.env.ALLOW_INSECURE_ADMIN_AUTH || '').toLowerCase() === 'true';
        return adminAuthDisabled;
    }

    async propose({ adminId, adminRoles = null, action, params, timelockMs = null, threshold = null, reason = null }) {
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
        audit(this, 'GOV_PROPOSAL_CREATED', adminId, { proposalId: id, action: proposal.action, params: proposal.params, executeAfter: proposal.executeAfter, threshold: th, timelockMs: tl, reason: proposal.reason }).catch(err => logger.error('[GovernanceEngine] Audit failed:', err));
        
        if (autoExecute) {
            await this.approve({ adminId, proposalId: id });
            const executed = await this.execute({ adminId, adminRoles, proposalId: id });
            this._syncState();
            
            // If execution failed, return success: false
            if (!executed.success) {
                return { success: false, action: proposal.action, proposalId: id, status: this.proposals.get(id)?.status, error: executed.error, autoExecuted: true, executed };
            }
            
            return { success: true, action: proposal.action, proposalId: id, status: this.proposals.get(id)?.status || 'EXECUTED', executeAfter: proposal.executeAfter, threshold: th, autoExecuted: true, executed };
        }
        this._syncState();
        return { success: true, action: proposal.action, proposalId: id, status: proposal.status, executeAfter: proposal.executeAfter, threshold: th };
    }

    async approve({ adminId, proposalId }) {
        if (!this._hasMember(adminId)) return { success: false, error: 'UNKNOWN_MEMBER' };
        const p = this.proposals.get(String(proposalId));
        if (!p) return { success: false, error: 'NOT_FOUND' };
        if (p.status !== 'PENDING' && p.status !== 'READY') return { success: false, error: `BAD_STATUS_${p.status}` };
        if (!p.approvals.has(String(adminId))) {
            p.approvals.set(String(adminId), { adminId: String(adminId), at: Date.now() });
            audit(this, 'GOV_APPROVED', adminId, { proposalId: p.id, approvals: p.approvals.size, threshold: p.threshold }).catch(err => logger.error('[GovernanceEngine] Audit failed:', err));
        }
        await updateReady(this, p);
        this._syncState();
        return { success: true, action: p.action, proposalId: p.id, approvals: p.approvals.size, status: p.status, idempotent: true };
    }

    async cancel({ adminId, proposalId, reason = 'CANCEL' }) {
        if (!this._hasMember(adminId)) return { success: false, error: 'UNKNOWN_MEMBER' };
        const p = this.proposals.get(String(proposalId));
        if (!p) return { success: false, error: 'NOT_FOUND' };
        if (p.status === 'EXECUTED') return { success: false, error: 'ALREADY_EXECUTED' };
        if (p.status === 'CANCELLED') return { success: true, action: p.action, proposalId: p.id, status: 'CANCELLED', idempotent: true };
        p.status = 'CANCELLED';
        p.cancelledAt = Date.now();
        p.reason = String(reason);
        audit(this, 'GOV_CANCELLED', adminId, { proposalId: p.id, reason: p.reason }).catch(err => logger.error('[GovernanceEngine] Audit failed:', err));
        this._syncState();
        return { success: true, action: p.action, proposalId: p.id, status: p.status };
    }

    async execute({ adminId, adminRoles = null, proposalId }) {
        if (!this._hasMember(adminId)) return { success: false, error: 'UNKNOWN_MEMBER' };
        const p = this.proposals.get(String(proposalId));
        if (!p) return { success: false, error: 'NOT_FOUND' };
        if (p.status === 'EXECUTED') return { success: true, action: p.action, proposalId: p.id, status: 'EXECUTED', idempotent: true };
        if (p.status !== 'READY') return { success: false, error: `BAD_STATUS_${p.status}` };
        if (Date.now() < p.executeAfter) return { success: false, error: 'TIMELOCK_PENDING', executeAfter: p.executeAfter };

        let result;
        try {
            result = await executeAction(this, p.action, p.params, { executorId: String(adminId), executorRoles: Array.isArray(adminRoles) ? adminRoles : null });
        } catch (error) {
            logger.error(`[GovernanceEngine] Execution failed for proposal ${proposalId}:`, error);
            p.status = 'FAILED';
            p.executedAt = Date.now();
            audit(this, 'GOV_EXECUTION_FAILED', adminId, {
                proposalId: p.id,
                action: p.action,
                error: String(error?.message || 'UNKNOWN_EXECUTION_ERROR')
            }).catch(err => logger.error(`[GovernanceEngine] Audit failed:`, err));
            this._syncState();
            return { success: false, action: p.action, proposalId: p.id, status: p.status, error: String(error?.message || 'UNKNOWN_EXECUTION_ERROR') };
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

        audit(this, 'GOV_EXECUTED', adminId, { proposalId: p.id, action: p.action, result, zkProof: p.zkProof }).catch(err => logger.error(`[GovernanceEngine] Audit failed:`, err));
        this._syncState();
        return { success: true, action: p.action, proposalId: p.id, status: p.status, result };
    }

    async _poll() {
        return poll(this);
    }

    applyEvent(e) {
        return applyEvent(this, e);
    }
}

module.exports = GovernanceEngine;
