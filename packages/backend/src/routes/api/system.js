const { validateBody } = require('../../core/security/Validate');
const { asyncRoute, sendGovernanceResponse } = require('./helpers');

module.exports = function setupSystemRoutes(app, svc, middlewares) {
    const { adminRate, authGovernor } = middlewares;

    app.post('/api/override', adminRate, authGovernor, asyncRoute(async (req, res) => {
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'OVERRIDE', params: {}, reason: 'API_OVERRIDE' });
        sendGovernanceResponse(res, result);
    }));

    app.post('/api/release', adminRate, authGovernor, asyncRoute(async (req, res) => {
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'RELEASE', params: {}, reason: 'API_RELEASE' });
        sendGovernanceResponse(res, result);
    }));

    app.post('/api/stop', adminRate, authGovernor, validateBody({ enable: { required: true, type: 'boolean' } }), asyncRoute(async (req, res) => {
        const { enable } = req.body;
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'TOGGLE_STOP', params: { enable }, reason: 'API_STOP' });
        sendGovernanceResponse(res, result);
    }));
};

