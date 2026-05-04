const { validateBody } = require('../../core/security/Validate');
const { GovernanceProposeResponseSchema, GovernanceApproveResponseSchema, GovernanceExecuteResponseSchema, GovernanceCancelResponseSchema, GovernanceProposalsListSchema } = require('@lex-atc/shared');
const { asyncRoute, sendWithContract } = require('./helpers');

module.exports = function setupGovernanceRoutes(app, svc, middlewares) {
    const { adminRate, authOperator, authGovernor, authExecutor } = middlewares;

    app.get('/api/governance/proposals', adminRate, authOperator, asyncRoute(async (_req, res) => {
        const result = svc.governanceEngine.getPublicState();
        sendWithContract(res, GovernanceProposalsListSchema, result, 'GovernanceProposalsList');
    }));

    app.post('/api/governance/proposals', adminRate, authGovernor, validateBody({ action: { required: true, type: 'string' }, params: { required: false, type: 'object' }, timelockMs: { required: false, type: 'number' }, threshold: { required: false, type: 'number' }, reason: { required: false, type: 'string' } }), asyncRoute(async (req, res) => {
        const { action, params, timelockMs, threshold, reason } = req.body;
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, adminRoles: req.admin.roles, action, params, timelockMs: timelockMs ?? null, threshold: threshold ?? null, reason: reason ?? null });
        sendWithContract(res, GovernanceProposeResponseSchema, result, 'GovernanceProposeResponse');
    }));

    app.post('/api/governance/proposals/:proposalId/approve', adminRate, authGovernor, asyncRoute(async (req, res) => {
        const { proposalId } = req.params;
        const result = await svc.governanceEngine.approve({ adminId: req.admin.id, proposalId });
        sendWithContract(res, GovernanceApproveResponseSchema, result, 'GovernanceApproveResponse');
    }));

    app.post('/api/governance/proposals/:proposalId/execute', adminRate, authExecutor, asyncRoute(async (req, res) => {
        const { proposalId } = req.params;
        const result = await svc.governanceEngine.execute({ adminId: req.admin.id, adminRoles: req.admin.roles, proposalId });
        sendWithContract(res, GovernanceExecuteResponseSchema, result, 'GovernanceExecuteResponse');
    }));

    app.post('/api/governance/proposals/:proposalId/cancel', adminRate, authGovernor, validateBody({ reason: { required: false, type: 'string' } }), asyncRoute(async (req, res) => {
        const { proposalId } = req.params;
        const { reason } = req.body || {};
        const result = await svc.governanceEngine.cancel({ adminId: req.admin.id, proposalId, reason: reason || 'CANCEL' });
        sendWithContract(res, GovernanceCancelResponseSchema, result, 'GovernanceCancelResponse');
    }));
};

