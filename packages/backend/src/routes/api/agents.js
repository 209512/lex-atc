const { validateBody } = require('../../core/security/Validate');
const { SYSTEM, AgentStatusResponseSchema, GovernanceProposalResponseSchema } = require('@lex-atc/shared');
const { asyncRoute, formatGovernanceProposalResponse, sendWithContract, sendGovernanceResponse } = require('./helpers');

module.exports = function setupAgentRoutes(app, svc, middlewares) {
    const { adminRate, authOperator, authGovernor } = middlewares;

    app.get('/api/agents/status', asyncRoute(async (req, res) => {
        const includePosition = String(req.query.includePosition || '').toLowerCase();
        const status = await svc.getAgentStatus({ includePosition: includePosition === '1' || includePosition === 'true' });
        sendWithContract(res, AgentStatusResponseSchema, status, 'AgentStatusResponse');
    }));

    app.post('/api/agents/scale', adminRate, authGovernor, validateBody({ count: { required: true, type: 'number' } }), asyncRoute(async (req, res) => {
        const { count } = req.body;
        if (count === undefined || count < 0 || count > 10) { 
            return res.status(400).json({ error: 'Invalid agent count (0-10)' });
        }
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'SCALE_AGENTS', params: { count }, reason: 'API_SCALE' });
        sendGovernanceResponse(res, result);
    }));

    app.post('/api/agents/register', adminRate, authGovernor, validateBody({ uuid: { required: true, type: 'string' }, config: { required: true, type: 'object' } }), asyncRoute(async (req, res) => {
        const { uuid, config } = req.body;
        if (!uuid || !config) return res.status(400).json({ error: 'Missing uuid or config' });
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'SET_AGENT_CONFIG', params: { uuid, config }, reason: 'API_REGISTER_CONFIG' });
        const payload = { ...formatGovernanceProposalResponse(result), message: `Registered config for agent` };
        sendWithContract(res, GovernanceProposalResponseSchema, payload, 'GovernanceProposalResponse');
    }));

    app.get('/api/agents/:uuid/config', asyncRoute(async (req, res) => {
        const { uuid } = req.params;
        const config = svc.agentConfigs ? svc.agentConfigs.get(uuid) : null;
        if (!config) {
            return res.json({
                provider: 'mock',
                model: '',
                systemPrompt: SYSTEM.DEFAULT_SYSTEM_PROMPT
            });
        }
        res.json(config);
    }));

    app.post('/api/agents/:uuid/config', adminRate, authGovernor, validateBody({ config: { required: true, type: 'object' } }), asyncRoute(async (req, res) => {
        const { uuid } = req.params;
        const { config } = req.body;
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'SET_AGENT_CONFIG', params: { uuid, config }, reason: 'API_SET_CONFIG' });
        sendGovernanceResponse(res, result);
    }));

    app.post('/api/agents/:uuid/pause', adminRate, authOperator, validateBody({ pause: { required: true, type: 'boolean' } }), asyncRoute(async (req, res) => {
        const { uuid } = req.params;
        const { pause } = req.body;
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'PAUSE_AGENT', params: { uuid, pause }, reason: 'API_PAUSE' });
        sendGovernanceResponse(res, result);
    }));

    app.delete('/api/agents/:uuid', adminRate, authGovernor, asyncRoute(async (req, res) => {
        const { uuid } = req.params;
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'TERMINATE_AGENT', params: { uuid }, reason: 'API_TERMINATE' });
        sendGovernanceResponse(res, result);
    }));

    app.post('/api/agents/:uuid/rename', adminRate, authOperator, validateBody({ newName: { required: true, type: 'string', maxLen: 20 } }), asyncRoute(async (req, res) => {
        const { uuid } = req.params;
        let { newName } = req.body;
        if (!newName || typeof newName !== 'string') return res.status(400).json({ error: 'Invalid Name' });
        newName = newName.trim().substring(0, 20); 
        
        const result = await svc.renameAgent(uuid, newName);
        await svc.recordEvent({
            shardId: 'RG-0',
            shardEpoch: svc.state?.shards?.['RG-0']?.epoch ?? 0,
            resourceId: svc.state?.shards?.['RG-0']?.resourceId ?? null,
            fenceToken: null,
            action: 'ADMIN_DIRECT_ACTION',
            actorUuid: req.admin.id,
            correlationId: `admin:rename:${uuid}:${Date.now()}`,
            payload: { action: 'RENAME', uuid, newName }
        });
        if (result) res.json({ success: true, name: newName });
        else res.status(404).json({ error: 'Agent not found' });
    }));

    app.post('/api/agents/:uuid/priority', adminRate, authOperator, validateBody({ enable: { required: true, type: 'boolean' } }), asyncRoute(async (req, res) => {
        const { uuid } = req.params;
        const { enable } = req.body;
        await svc.togglePriority(uuid, enable);
        await svc.recordEvent({
            shardId: 'RG-0',
            shardEpoch: svc.state?.shards?.['RG-0']?.epoch ?? 0,
            resourceId: svc.state?.shards?.['RG-0']?.resourceId ?? null,
            fenceToken: null,
            action: 'ADMIN_DIRECT_ACTION',
            actorUuid: req.admin.id,
            correlationId: `admin:priority:${uuid}:${Date.now()}`,
            payload: { action: 'PRIORITY', uuid, enable }
        });
        res.json({ success: true });
    }));

    app.post('/api/agents/priority-order', adminRate, authOperator, validateBody({ order: { required: true, type: 'array' } }), asyncRoute(async (req, res) => {
        const { order } = req.body;
        if (!Array.isArray(order)) return res.status(400).json({ error: 'Order must be an array' });
        
        await svc.updatePriorityOrder(order);
        await svc.recordEvent({
            shardId: 'RG-0',
            shardEpoch: svc.state?.shards?.['RG-0']?.epoch ?? 0,
            resourceId: svc.state?.shards?.['RG-0']?.resourceId ?? null,
            fenceToken: null,
            action: 'ADMIN_DIRECT_ACTION',
            actorUuid: req.admin.id,
            correlationId: `admin:priority_order:${Date.now()}`,
            payload: { action: 'PRIORITY_ORDER', order }
        });
        res.json({ success: true });
    }));

    app.post('/api/agents/:uuid/transfer-lock', adminRate, authGovernor, asyncRoute(async (req, res) => {
        const { uuid } = req.params;
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'TRANSFER_LOCK', params: { uuid }, reason: 'API_TRANSFER_LOCK' });
        sendGovernanceResponse(res, result);
    }));
};

