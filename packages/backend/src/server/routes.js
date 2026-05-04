const { requireAdminAuth } = require('../core/security/AdminAuth');
const { createRateLimitMiddleware } = require('../core/security/RateLimit');
const logger = require('../utils/logger');

module.exports = function setupRoutes(app, svc, cfg, deps, { limiter, adminRate }) {
    require("../routes/alert.routes")(app, svc, { globalRate: limiter ? createRateLimitMiddleware(limiter, { limit: cfg.rateLimit.global.limit, windowMs: cfg.rateLimit.global.windowMs, prefix: 'alerts' }) : (req, res, next) => next() });

    const authOperator = requireAdminAuth({ requiredRoles: ['operator', 'governor', 'executor'] });
    const authGovernor = requireAdminAuth({ requiredRoles: ['governor', 'executor'] });
    const authExecutor = requireAdminAuth({ requiredRoles: ['executor'] });

    if (deps.sseService) {
        deps.sseService.attachRoute(app, { authStream: authOperator });
    }

    require("../routes/api.routes")(app, svc, { adminRate, authOperator, authGovernor, authExecutor });

    app.use('/api', (_req, res) => {
        res.status(404).json({ error: 'ROUTE_NOT_FOUND' });
    });

    app.use((err, _req, res, _next) => {
        const message = String(err?.message || 'INTERNAL_SERVER_ERROR');
        if (err instanceof SyntaxError) return res.status(400).json({ error: 'BAD_JSON_BODY' });
        if (message === 'CORS_DENIED') return res.status(403).json({ error: 'CORS_DENIED' });

        logger.error('API route failed:', err);

        if (cfg.nodeEnv === 'production') {
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' });
        }
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message });
    });
};
