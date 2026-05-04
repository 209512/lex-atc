const { validateBody } = require('../../core/security/Validate');
const { asyncRoute, sendGovernanceResponse } = require('./helpers');

module.exports = function setupSettlementRoutes(app, svc, middlewares) {
    const { adminRate, authExecutor } = middlewares;

    app.post('/api/settlement/disputes', adminRate, authExecutor, validateBody({ channelId: { required: false, type: 'string' }, actorUuid: { required: false, type: 'string' }, openedBy: { required: false, type: 'string' }, targetNonce: { required: false, type: 'number' }, reason: { required: false, type: 'string' } }), asyncRoute(async (req, res) => {
        const { channelId, actorUuid, openedBy, targetNonce, reason } = req.body || {};
        if (!channelId && !actorUuid) {
            return res.status(400).json({ error: 'Must provide either channelId or actorUuid' });
        }
        const effectiveChannelId = channelId || `channel:${actorUuid}`;
        const result = await svc.governanceEngine.propose({
            adminId: req.admin.id,
            action: 'SETTLEMENT_DISPUTE',
            params: { channelId: effectiveChannelId, openedBy: openedBy || req.admin.id, targetNonce: Number(targetNonce) || 0, reason: reason || 'DISPUTE' },
            reason: 'API_SETTLEMENT_DISPUTE'
        });
        sendGovernanceResponse(res, result);
    }));

    app.post('/api/settlement/slash', adminRate, authExecutor, validateBody({ channelId: { required: false, type: 'string' }, actorUuid: { required: false, type: 'string' }, reason: { required: false, type: 'string' } }), asyncRoute(async (req, res) => {
        const { channelId, actorUuid, reason } = req.body || {};
        
        if (!channelId && !actorUuid) {
            return res.status(400).json({ error: 'Must provide either channelId or actorUuid' });
        }
        
        const effectiveChannelId = channelId || `channel:${actorUuid}`;

        const result = await svc.governanceEngine.propose({
            adminId: req.admin.id,
            action: 'SETTLEMENT_SLASH',
            params: { channelId: effectiveChannelId, actorUuid: actorUuid || req.admin.id, reason: reason || 'SLASH' },
            reason: 'API_SETTLEMENT_SLASH'
        });
        sendGovernanceResponse(res, result);
    }));
};

