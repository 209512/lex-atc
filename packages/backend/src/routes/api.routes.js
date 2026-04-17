const { validateBody } = require('../core/security/Validate');
const { SYSTEM } = require('@lex-atc/shared');
const jwt = require('jsonwebtoken');
const { verifySolanaSignature } = require('../core/security/AdminAuth');

const logger = require('../utils/logger');

const asyncRoute = (handler) => (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(err => {
        logger.error(`[API Route Error] ${req.method} ${req.url}:`, err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message || 'An unexpected error occurred' });
        }
        next(err);
    });
};

const getCookieValue = (req, name) => {
    const raw = String(req?.headers?.cookie || '');
    if (!raw) return null;
    const parts = raw.split(';');
    for (const p of parts) {
        const idx = p.indexOf('=');
        if (idx === -1) continue;
        const k = p.slice(0, idx).trim();
        if (k !== name) continue;
        const v = p.slice(idx + 1).trim();
        try { return decodeURIComponent(v); } catch { return v; }
    }
    return null;
};

module.exports = function setupApiRoutes(app, svc, middlewares) {
    const { adminRate, authOperator, authGovernor, authExecutor } = middlewares;

    // ==========================================
    // 0. Auth Session (HttpOnly Cookie)
    // ==========================================
    app.post('/api/auth/session', adminRate, asyncRoute(async (req, res) => {
        const disabled = String(process.env.ADMIN_AUTH_DISABLED || '').toLowerCase() === 'true';
        const nodeEnv = String(process.env.NODE_ENV || 'development');
        if (disabled && nodeEnv !== 'production') {
            return res.json({ success: true, mode: 'disabled' });
        }

        const secret = process.env.ADMIN_TOKEN_SECRET;
        if (!secret) return res.status(500).json({ error: 'ADMIN_AUTH_NOT_CONFIGURED' });

        const existing = getCookieValue(req, 'lex_atc_admin_token');
        if (existing) return res.json({ success: true, mode: 'cookie' });

        const header = String(req.headers.authorization || '');
        const m = header.match(/^Bearer\s+(.+)$/i);
        if (m) {
            const token = m[1];
            try {
                jwt.verify(token, secret, { algorithms: ['HS256'] });
            } catch (err) {
                if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'TOKEN_EXPIRED' });
                if (err.name === 'JsonWebTokenError') return res.status(401).json({ error: 'MALFORMED_TOKEN' });
                if (err.name === 'NotBeforeError') return res.status(401).json({ error: 'TOKEN_NOT_ACTIVE' });
                return res.status(401).json({ error: 'INVALID_SIGNATURE' });
            }

            res.cookie('lex_atc_admin_token', token, {
                httpOnly: true,
                sameSite: 'lax',
                secure: nodeEnv === 'production',
                path: '/',
                maxAge: 2 * 60 * 60 * 1000
            });
            return res.json({ success: true, mode: 'jwt' });
        }

        if (req.headers['x-wallet-signature'] || req.headers['x-wallet-signatures']) {
            const isValidWeb3 = verifySolanaSignature(req);
            if (!isValidWeb3 || !isValidWeb3.ok) return res.status(401).json({ error: 'INVALID_SOLANA_SIGNATURE_OR_THRESHOLD_NOT_MET' });

            const allowlist = isValidWeb3.allowlist;
            let combinedRoles = new Set();

            if (nodeEnv === 'production') {
                if (!allowlist || allowlist.size === 0) return res.status(500).json({ error: 'ADMIN_SOLANA_ALLOWLIST_NOT_CONFIGURED' });
                for (const pk of isValidWeb3.pubkeys) {
                    const roles = allowlist?.get(pk) || [];
                    roles.forEach(r => combinedRoles.add(r));
                }
                if (combinedRoles.size === 0) return res.status(403).json({ error: 'FORBIDDEN' });
            } else {
                combinedRoles = new Set(['root', 'governor', 'operator', 'executor']);
            }

            const issued = jwt.sign(
                { sub: isValidWeb3.pubkeys.join(','), roles: Array.from(combinedRoles) },
                secret,
                { algorithm: 'HS256', expiresIn: '2h' }
            );

            res.cookie('lex_atc_admin_token', issued, {
                httpOnly: true,
                sameSite: 'lax',
                secure: nodeEnv === 'production',
                path: '/',
                maxAge: 2 * 60 * 60 * 1000
            });
            return res.json({ success: true, mode: 'solana' });
        }

        return res.status(401).json({ error: 'UNAUTHORIZED' });
    }));

    app.delete('/api/auth/session', adminRate, asyncRoute(async (_req, res) => {
        res.cookie('lex_atc_admin_token', '', { httpOnly: true, sameSite: 'lax', secure: String(process.env.NODE_ENV || 'development') === 'production', path: '/', maxAge: 0 });
        return res.json({ success: true });
    }));

    // ==========================================
    // 1. System Control
    // ==========================================
    app.post('/api/override', adminRate, authGovernor, asyncRoute(async (req, res) => {
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'OVERRIDE', params: {}, reason: 'API_OVERRIDE' });
        res.json({ success: true, scheduled: true, ...result });
    }));

    app.post('/api/release', adminRate, authGovernor, asyncRoute(async (req, res) => {
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'RELEASE', params: {}, reason: 'API_RELEASE' });
        res.json({ success: true, scheduled: true, ...result });
    }));

    app.post('/api/stop', adminRate, authGovernor, validateBody({ enable: { required: true, type: 'boolean' } }), asyncRoute(async (req, res) => {
        const { enable } = req.body;
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'TOGGLE_STOP', params: { enable }, reason: 'API_STOP' });
        res.json({ success: true, scheduled: true, ...result });
    }));

    // ==========================================
    // 2. Agent Management
    // ==========================================
    app.get('/api/agents/status', asyncRoute(async (req, res) => {
        const status = await svc.getAgentStatus();
        res.json(status);
    }));

    app.post('/api/agents/scale', adminRate, authGovernor, validateBody({ count: { required: true, type: 'number' } }), asyncRoute(async (req, res) => {
        const { count } = req.body;
        if (count === undefined || count < 0 || count > 10) { 
            return res.status(400).json({ error: 'Invalid agent count (0-10)' });
        }
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'SCALE_AGENTS', params: { count }, reason: 'API_SCALE' });
        res.json({ success: true, scheduled: true, ...result });
    }));

    app.post('/api/agents/register', adminRate, authGovernor, validateBody({ uuid: { required: true, type: 'string' }, config: { required: true, type: 'object' } }), asyncRoute(async (req, res) => {
        const { uuid, config } = req.body;
        if (!uuid || !config) return res.status(400).json({ error: 'Missing uuid or config' });
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'SET_AGENT_CONFIG', params: { uuid, config }, reason: 'API_REGISTER_CONFIG' });
        res.json({ success: true, message: `Registered config for agent`, ...result });
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
        res.json({ success: true, scheduled: true, ...result });
    }));

    app.post('/api/agents/:uuid/pause', adminRate, authOperator, validateBody({ pause: { required: true, type: 'boolean' } }), asyncRoute(async (req, res) => {
        const { uuid } = req.params;
        const { pause } = req.body;
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'PAUSE_AGENT', params: { uuid, pause }, reason: 'API_PAUSE' });
        res.json({ success: true, scheduled: true, ...result });
    }));

    app.delete('/api/agents/:uuid', adminRate, authGovernor, asyncRoute(async (req, res) => {
        const { uuid } = req.params;
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'TERMINATE_AGENT', params: { uuid }, reason: 'API_TERMINATE' });
        res.json({ success: true, scheduled: true, ...result });
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
        res.json({ success: true, scheduled: true, ...result });
    }));

    // ==========================================
    // 3. Task Management (DLQ & Retries)
    // ==========================================
    app.get('/api/tasks/pending', adminRate, authOperator, asyncRoute(async (req, res) => {
        const result = svc.listIsolationTasks();
        res.json(result);
    }));

    app.post('/api/tasks/:taskId/finalize', adminRate, authExecutor, asyncRoute(async (req, res) => {
        const { taskId } = req.params;
        const { adminUuid } = req.body || {};
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'TASK_FINALIZE', params: { taskId, adminUuid: adminUuid || req.admin.id }, reason: 'API_TASK_FINALIZE' });
        res.json({ success: true, scheduled: true, ...result });
    }));

    app.post('/api/tasks/:taskId/rollback', adminRate, authExecutor, asyncRoute(async (req, res) => {
        const { taskId } = req.params;
        const { adminUuid, reason } = req.body || {};
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'TASK_ROLLBACK', params: { taskId, adminUuid: adminUuid || req.admin.id, reason: reason || 'ROLLBACK' }, reason: 'API_TASK_ROLLBACK' });
        res.json({ success: true, scheduled: true, ...result });
    }));

    app.post('/api/tasks/:taskId/cancel', adminRate, authExecutor, asyncRoute(async (req, res) => {
        const { taskId } = req.params;
        const { adminUuid, reason } = req.body || {};
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'TASK_CANCEL', params: { taskId, adminUuid: adminUuid || req.admin.id, reason: reason || 'CANCEL' }, reason: 'API_TASK_CANCEL' });
        res.json({ success: true, scheduled: true, ...result });
    }));

    app.post('/api/tasks/:taskId/retry', adminRate, authExecutor, asyncRoute(async (req, res) => {
        const { taskId } = req.params;
        const { adminUuid } = req.body || {};
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action: 'TASK_RETRY', params: { taskId, adminUuid: adminUuid || req.admin.id }, reason: 'API_TASK_RETRY' });
        res.json({ success: true, scheduled: true, ...result });
    }));

    // ==========================================
    // 4. Web3 Settlement & Dispute
    // ==========================================
    app.post('/api/settlement/disputes', adminRate, authExecutor, validateBody({ channelId: { required: true, type: 'string' }, openedBy: { required: false, type: 'string' }, targetNonce: { required: false, type: 'number' }, reason: { required: false, type: 'string' } }), asyncRoute(async (req, res) => {
        const { channelId, openedBy, targetNonce, reason } = req.body || {};
        const result = await svc.governanceEngine.propose({
            adminId: req.admin.id,
            action: 'SETTLEMENT_DISPUTE',
            params: { channelId, openedBy: openedBy || req.admin.id, targetNonce: Number(targetNonce) || 0, reason: reason || 'DISPUTE' },
            reason: 'API_SETTLEMENT_DISPUTE'
        });
        res.json({ success: true, scheduled: true, ...result });
    }));

    app.post('/api/settlement/slash', adminRate, authExecutor, validateBody({ channelId: { required: false, type: 'string' }, actorUuid: { required: false, type: 'string' }, reason: { required: false, type: 'string' } }), asyncRoute(async (req, res) => {
        const { channelId, actorUuid, reason } = req.body || {};
        
        // Ensure either channelId or actorUuid is provided
        if (!channelId && !actorUuid) {
            return res.status(400).json({ error: 'Must provide either channelId or actorUuid' });
        }
        
        // If channelId is empty, construct a mock one based on the actorUuid to satisfy downstream requirements
        const effectiveChannelId = channelId || `channel:${actorUuid}`;

        const result = await svc.governanceEngine.propose({
            adminId: req.admin.id,
            action: 'SETTLEMENT_SLASH',
            params: { channelId: effectiveChannelId, actorUuid: actorUuid || req.admin.id, reason: reason || 'SLASH' },
            reason: 'API_SETTLEMENT_SLASH'
        });
        res.json({ success: true, scheduled: true, ...result });
    }));

    // ==========================================
    // 5. Governance Proposals
    // ==========================================
    app.get('/api/governance/proposals', adminRate, authOperator, asyncRoute(async (req, res) => {
        const result = svc.governanceEngine.getPublicState();
        res.json(result);
    }));

    app.post('/api/governance/proposals', adminRate, authGovernor, validateBody({ action: { required: true, type: 'string' }, params: { required: false, type: 'object' }, timelockMs: { required: false, type: 'number' }, threshold: { required: false, type: 'number' }, reason: { required: false, type: 'string' } }), asyncRoute(async (req, res) => {
        const { action, params, timelockMs, threshold, reason } = req.body;
        const result = await svc.governanceEngine.propose({ adminId: req.admin.id, action, params, timelockMs: timelockMs ?? null, threshold: threshold ?? null, reason: reason ?? null });
        res.json(result);
    }));

    app.post('/api/governance/proposals/:proposalId/approve', adminRate, authGovernor, asyncRoute(async (req, res) => {
        const { proposalId } = req.params;
        const result = await svc.governanceEngine.approve({ adminId: req.admin.id, proposalId });
        res.json(result);
    }));

    app.post('/api/governance/proposals/:proposalId/execute', adminRate, authExecutor, asyncRoute(async (req, res) => {
        const { proposalId } = req.params;
        const result = await svc.governanceEngine.execute({ adminId: req.admin.id, proposalId });
        res.json(result);
    }));

    app.post('/api/governance/proposals/:proposalId/cancel', adminRate, authGovernor, validateBody({ reason: { required: false, type: 'string' } }), asyncRoute(async (req, res) => {
        const { proposalId } = req.params;
        const { reason } = req.body || {};
        const result = await svc.governanceEngine.cancel({ adminId: req.admin.id, proposalId, reason: reason || 'CANCEL' });
        res.json(result);
    }));
};
