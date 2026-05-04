const jwt = require('jsonwebtoken');
const { verifySolanaSignature } = require('./solana');
const { getCookieValue } = require('./cookies');

const requireAdminAuth = (opts = {}) => {
    const {
        requiredRoles = [],
        allowWhenDisabled = true,
    } = opts;

    return (req, res, next) => {
        const nodeEnv = String(process.env.NODE_ENV || 'development');
        const disabled =
            nodeEnv !== 'production' &&
            String(process.env.ADMIN_AUTH_DISABLED || '').toLowerCase() === 'true' &&
            String(process.env.ALLOW_INSECURE_ADMIN_AUTH || '').toLowerCase() === 'true';
        const secret = process.env.ADMIN_TOKEN_SECRET;

        if (disabled) {
            if (nodeEnv === 'production') {
                return res.status(503).json({ error: 'ADMIN_AUTH_DISABLED_IN_PRODUCTION' });
            }
            if (allowWhenDisabled) {
                req.admin = { id: 'DEMO_ADMIN', roles: ['root', 'governor', 'operator', 'executor'] };
                return next();
            }
            return res.status(503).json({ error: 'ADMIN_AUTH_DISABLED' });
        }

        if (!secret) {
            if (process.env.NODE_ENV === 'test') {
                req.admin = { id: 'TEST_ADMIN', roles: ['root', 'governor', 'operator', 'executor'] };
                return next();
            }
            return res.status(500).json({ error: 'ADMIN_AUTH_NOT_CONFIGURED' });
        }

        if (req.headers['x-wallet-signature'] || req.headers['x-wallet-signatures']) {
            const isValidWeb3 = verifySolanaSignature(req);
            if (isValidWeb3 && isValidWeb3.ok) {
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

                req.admin = { id: isValidWeb3.pubkeys.join(','), roles: Array.from(combinedRoles) };
                return next();
            } else {
                return res.status(401).json({ error: 'INVALID_SOLANA_SIGNATURE_OR_THRESHOLD_NOT_MET' });
            }
        }

        const cookieToken = getCookieValue(req, 'lex_atc_admin_token');
        let header = String(req.headers.authorization || '');
        if (!header && cookieToken) {
            header = `Bearer ${cookieToken}`;
        }

        const m = header.match(/^Bearer\s+(.+)$/i);
        if (!m) return res.status(401).json({ error: 'UNAUTHORIZED' });

        const token = m[1];
        try {
            const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
            req.admin = payload;
        } catch (err) {
            if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'TOKEN_EXPIRED' });
            if (err.name === 'JsonWebTokenError') return res.status(401).json({ error: 'MALFORMED_TOKEN' });
            if (err.name === 'NotBeforeError') return res.status(401).json({ error: 'TOKEN_NOT_ACTIVE' });
            return res.status(401).json({ error: 'INVALID_SIGNATURE' });
        }

        const roles = new Set(req.admin.roles || []);
        if (roles.has('root')) return next();
        if (requiredRoles.length > 0) {
            const ok = requiredRoles.some(r => roles.has(r));
            if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });
        }
        return next();
    };
};

module.exports = { requireAdminAuth };
