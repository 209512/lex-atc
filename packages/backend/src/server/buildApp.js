const express = require('express');
const helmet = require('helmet');
const { RateLimiter, createRateLimitMiddleware } = require('../core/security/RateLimit');
const { loadBackendConfig } = require('../config/env');
const createCorsMiddleware = require('./cors');
const createCsrfMiddleware = require('./csrf');
const setupMetrics = require('./metrics');
const setupHealth = require('./health');
const setupRoutes = require('./routes');

const buildApp = (svc, cfg = null, deps = {}) => {
    cfg = cfg || loadBackendConfig(process.env);
    const app = express();
    if (Number(cfg.server.trustProxyHops || 0) > 0) {
        app.set('trust proxy', Number(cfg.server.trustProxyHops));
    }

    app.use(helmet());
    app.use(createCorsMiddleware(cfg));
    app.use((err, _req, res, next) => {
        if (err && String(err.message) === 'CORS_DENIED') return res.status(403).json({ error: 'CORS_DENIED' });
        return next(err);
    });

    app.use(express.json({ limit: cfg.server.jsonBodyLimit }));
    app.use('/api', createCsrfMiddleware(cfg));

    const limiter = new RateLimiter();
    app.limiter = limiter;
    app.use(createRateLimitMiddleware(limiter, { limit: cfg.rateLimit.global.limit, windowMs: cfg.rateLimit.global.windowMs, prefix: 'global' }));
    const adminRate = createRateLimitMiddleware(limiter, { limit: cfg.rateLimit.admin.limit, windowMs: cfg.rateLimit.admin.windowMs, prefix: 'admin' });

    setupMetrics(app, svc);
    setupHealth(app, svc, cfg, deps);
    setupRoutes(app, svc, cfg, deps, { limiter, adminRate });
    return app;
};

module.exports = { buildApp };

