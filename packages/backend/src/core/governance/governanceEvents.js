const CONSTANTS = require('../../config/constants');

module.exports = function applyEvent(engine, e) {
    if (!String(e.action || '').startsWith('GOV_')) return;
    const p = e.payload || {};
    const id = String(p.proposalId || '');
    if (!id) return;

    if (e.action === 'GOV_PROPOSAL_CREATED') {
        if (!engine.proposals.has(id)) {
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
            engine.proposals.set(id, proposal);
        }
    }

    const proposal = engine.proposals.get(id);
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
};

