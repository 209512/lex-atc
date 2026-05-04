const jwt = require('jsonwebtoken');
const { AuthSessionResponseSchema } = require('@lex-atc/shared');
const { verifySolanaSignature } = require('../../core/security/AdminAuth');
const { asyncRoute, getCookieValue, ensureCsrfCookie, sendWithContract } = require('./helpers');

module.exports = function setupAuthRoutes(app, _svc, middlewares) {
    const { adminRate } = middlewares;

    app.post('/api/auth/session', adminRate, asyncRoute(async (req, res) => {
        const disabled = String(process.env.ADMIN_AUTH_DISABLED || '').toLowerCase() === 'true';
        const nodeEnv = String(process.env.NODE_ENV || 'development');
        if (disabled && nodeEnv !== 'production') {
            ensureCsrfCookie(req, res, nodeEnv);
            return sendWithContract(res, AuthSessionResponseSchema, { success: true, mode: 'disabled' }, 'AuthSessionResponse');
        }

        const secret = process.env.ADMIN_TOKEN_SECRET;
        if (!secret) return res.status(500).json({ error: 'ADMIN_AUTH_NOT_CONFIGURED' });

        const existing = getCookieValue(req, 'lex_atc_admin_token');
        if (existing) {
            try {
                jwt.verify(existing, secret, { algorithms: ['HS256'] });
            } catch (err) {
                res.cookie('lex_atc_admin_token', '', { httpOnly: true, sameSite: 'lax', secure: nodeEnv === 'production', path: '/', maxAge: 0 });
                if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'TOKEN_EXPIRED' });
                if (err.name === 'JsonWebTokenError') return res.status(401).json({ error: 'MALFORMED_TOKEN' });
                if (err.name === 'NotBeforeError') return res.status(401).json({ error: 'TOKEN_NOT_ACTIVE' });
                return res.status(401).json({ error: 'INVALID_SIGNATURE' });
            }
            ensureCsrfCookie(req, res, nodeEnv);
            return sendWithContract(res, AuthSessionResponseSchema, { success: true, mode: 'cookie' }, 'AuthSessionResponse');
        }

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
            ensureCsrfCookie(req, res, nodeEnv);
            return sendWithContract(res, AuthSessionResponseSchema, { success: true, mode: 'jwt' }, 'AuthSessionResponse');
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
            ensureCsrfCookie(req, res, nodeEnv);
            return sendWithContract(res, AuthSessionResponseSchema, { success: true, mode: 'solana' }, 'AuthSessionResponse');
        }

        return res.status(401).json({ error: 'UNAUTHORIZED' });
    }));

    app.delete('/api/auth/session', adminRate, asyncRoute(async (_req, res) => {
        res.cookie('lex_atc_admin_token', '', { httpOnly: true, sameSite: 'lax', secure: String(process.env.NODE_ENV || 'development') === 'production', path: '/', maxAge: 0 });
        res.cookie('lex_atc_csrf', '', { httpOnly: false, sameSite: 'lax', secure: String(process.env.NODE_ENV || 'development') === 'production', path: '/', maxAge: 0 });
        return res.json({ success: true });
    }));
};
