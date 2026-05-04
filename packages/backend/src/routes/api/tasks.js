const { IsolationTasksResponseSchema } = require('@lex-atc/shared');
const { asyncRoute, sendWithContract, sendGovernanceResponse } = require('./helpers');

module.exports = function setupTaskRoutes(app, svc, middlewares) {
    const { adminRate, authOperator, authExecutor } = middlewares;

    app.get('/api/tasks/pending', adminRate, authOperator, asyncRoute(async (_req, res) => {
        const result = svc.listIsolationTasks();
        sendWithContract(res, IsolationTasksResponseSchema, result, 'IsolationTasksResponse');
    }));

    app.post('/api/tasks/:taskId/finalize', adminRate, authExecutor, asyncRoute(async (req, res) => {
        const { taskId } = req.params;
        const { adminUuid } = req.body || {};
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'TASK_FINALIZE', params: { taskId, adminUuid: adminUuid || req.admin.id }, reason: 'API_TASK_FINALIZE' });
        sendGovernanceResponse(res, result);
    }));

    app.post('/api/tasks/:taskId/rollback', adminRate, authExecutor, asyncRoute(async (req, res) => {
        const { taskId } = req.params;
        const { adminUuid, reason } = req.body || {};
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'TASK_ROLLBACK', params: { taskId, adminUuid: adminUuid || req.admin.id, reason: reason || 'ROLLBACK' }, reason: 'API_TASK_ROLLBACK' });
        sendGovernanceResponse(res, result);
    }));

    app.post('/api/tasks/:taskId/cancel', adminRate, authExecutor, asyncRoute(async (req, res) => {
        const { taskId } = req.params;
        const { adminUuid, reason } = req.body || {};
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'TASK_CANCEL', params: { taskId, adminUuid: adminUuid || req.admin.id, reason: reason || 'CANCEL' }, reason: 'API_TASK_CANCEL' });
        sendGovernanceResponse(res, result);
    }));

    app.post('/api/tasks/:taskId/retry', adminRate, authExecutor, asyncRoute(async (req, res) => {
        const { taskId } = req.params;
        const { adminUuid } = req.body || {};
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'TASK_RETRY', params: { taskId, adminUuid: adminUuid || req.admin.id }, reason: 'API_TASK_RETRY' });
        sendGovernanceResponse(res, result);
    }));
};

