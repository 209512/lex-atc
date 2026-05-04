const { loadBackendConfig } = require('../config/env');
const logger = require('../utils/logger');
const { buildApp } = require('./buildApp');
const SSEService = require('../services/SSEService');
const crypto = require('crypto');

const start = async ({ atcService, port, initialAgents = 2 } = {}) => {
    require('dotenv').config();
    const cfg = loadBackendConfig(process.env);

    let sseService = null;
    if (process.env.NODE_ENV !== 'test') {
        sseService = new SSEService(atcService, cfg);
        sseService.init();
    }

    let app;
    try {
        app = buildApp(atcService, cfg, { sseService });
    } catch (err) {
        logger.error('❌ Failed to build app:', err.message);
        if (process.env.NODE_ENV === 'production') {
            logger.error('❌ FATAL: Cannot bypass auth in production. Shutting down.');
            process.exit(1);
        } else if (String(process.env.ALLOW_DEV_AUTH_FALLBACK || '').toLowerCase() === 'true') {
            logger.warn('⚠️ Falling back to development initialization with an ephemeral admin token secret.');
            const fallbackSecret = process.env.ADMIN_TOKEN_SECRET || crypto.randomBytes(48).toString('hex');
            app = buildApp(atcService, loadBackendConfig({
                ...process.env,
                NODE_ENV: process.env.NODE_ENV || 'development',
                ADMIN_AUTH_DISABLED: 'false',
                ALLOW_INSECURE_ADMIN_AUTH: 'false',
                ADMIN_TOKEN_SECRET: fallbackSecret
            }), { sseService });
        } else {
            throw err;
        }
    }

    app.sseService = sseService;

    await atcService.init(initialAgents);
    logger.info('✅ System Initialized. Starting Web Server...');

    const server = app.listen(port, '0.0.0.0', () => {
        logger.info(`Server running on port ${port}`);
    });
    server.app = app;
    return server;
};

module.exports = { start };
