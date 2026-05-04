module.exports = function createCsrfMiddleware(cfg) {
    const allowedOrigins = cfg.cors.allowedOrigins;
    const allowLocalWildcard = String(process.env.CORS_ALLOW_LOCALHOST_WILDCARD || '').toLowerCase() === 'true';

    return (req, res, next) => {
        if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
        if (req.path === '/health' || req.path === '/ready' || req.path === '/doctor') return next();
        if (req.path === '/auth/session') return next();

        const cookie = String(req.headers.cookie || '');
        const csrfEnforceAll = String(process.env.CSRF_ENFORCE_ALL_UNSAFE || '').toLowerCase() === 'true';
        const cookieHasAdmin = cookie.includes('lex_atc_admin_token=');
        const cookieHasCsrf = cookie.includes('lex_atc_csrf=');
        if (!cookieHasAdmin && !(csrfEnforceAll && cookieHasCsrf)) return next();

        const origin = String(req.headers.origin || '');
        if (!origin) return res.status(403).json({ error: 'CSRF_ORIGIN_REQUIRED' });

        const getCookieValue = (raw, name) => {
            if (!raw) return null;
            const parts = String(raw).split(';');
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

        const originAllowed =
            (allowLocalWildcard && /^(http:\/\/(localhost|127\.0\.0\.1):\d+)$/.test(origin)) ||
            allowedOrigins.includes(origin) ||
            allowedOrigins.includes('*');
        if (!originAllowed) return res.status(403).json({ error: 'CSRF_ORIGIN_DENIED' });

        const csrfCookie = getCookieValue(cookie, 'lex_atc_csrf');
        const csrfHeader = String(req.headers['x-csrf-token'] || '');
        if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) return res.status(403).json({ error: 'CSRF_TOKEN_INVALID' });
        return next();
    };
};

