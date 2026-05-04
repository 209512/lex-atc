const crypto = require('crypto');
const { GovernanceProposalResponseSchema } = require('@lex-atc/shared');
const logger = require('../../utils/logger');

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

const formatGovernanceProposalResponse = (result) => {
    const proposalId = result?.proposalId || null;
    const scheduled = Boolean(proposalId);
    const executed = result?.executed || null;
    const executedOk = executed ? executed.success === true : null;
    return {
        success: result?.success === true,
        accepted: scheduled,
        scheduled,
        proposalId,
        status: result?.status || null,
        autoExecuted: result?.autoExecuted === true,
        executeAfter: result?.executeAfter ?? null,
        threshold: result?.threshold ?? null,
        executed,
        executedOk,
        error: result?.error ?? null,
    };
};

const ensureCsrfCookie = (req, res, nodeEnv) => {
    const existing = getCookieValue(req, 'lex_atc_csrf');
    if (existing) return existing;
    const token = crypto.randomBytes(24).toString('hex');
    res.cookie('lex_atc_csrf', token, {
        httpOnly: false,
        sameSite: 'lax',
        secure: nodeEnv === 'production',
        path: '/',
        maxAge: 2 * 60 * 60 * 1000
    });
    return token;
};

const getContractMode = () => String(process.env.CONTRACT_MODE || 'warn').toLowerCase();

const sendWithContract = (res, schema, payload, name) => {
    if (payload && payload.success === false) return res.json(payload);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
        logger.warn(`[CONTRACT] ${name} validation failed`);
        if (getContractMode() === 'enforce') {
            return res.status(500).json({ error: 'CONTRACT_VIOLATION', name });
        }
    }
    return res.json(payload);
};

const sendGovernanceResponse = (res, result) => {
    const payload = formatGovernanceProposalResponse(result);
    return sendWithContract(res, GovernanceProposalResponseSchema, payload, 'GovernanceProposalResponse');
};

module.exports = {
    asyncRoute,
    getCookieValue,
    formatGovernanceProposalResponse,
    ensureCsrfCookie,
    sendWithContract,
    sendGovernanceResponse,
};

