const cors = require('cors');

module.exports = function createCorsMiddleware(cfg) {
    const allowedOrigins = cfg.cors.allowedOrigins;
    const allowLocalWildcard = String(process.env.CORS_ALLOW_LOCALHOST_WILDCARD || '').toLowerCase() === 'true';
    if (cfg.nodeEnv === 'production') {
        if (allowLocalWildcard) {
            throw new Error('CORS_ALLOW_LOCALHOST_WILDCARD_NOT_ALLOWED_IN_PRODUCTION');
        }
        if (allowedOrigins.includes('*')) {
            throw new Error('CORS_WILDCARD_NOT_ALLOWED_WITH_CREDENTIALS');
        }
    }

    return cors({
        origin: (origin, cb) => {
            if (!origin) {
                return cb(null, true);
            }
            if (allowLocalWildcard && /^(http:\/\/(localhost|127\.0\.0\.1):\d+)$/.test(origin)) {
                return cb(null, true);
            }
            if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
                return cb(null, true);
            }
            return cb(new Error('CORS_DENIED'));
        },
        credentials: true,
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'PUT', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Last-Event-ID', 'x-csrf-token', 'x-wallet-signature', 'x-wallet-signatures', 'x-wallet-pubkey', 'x-wallet-pubkeys', 'x-timestamp'],
    });
};

