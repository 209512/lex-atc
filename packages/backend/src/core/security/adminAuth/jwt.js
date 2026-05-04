const jwt = require('jsonwebtoken');

const verifyToken = (token, secret) => {
    if (!token || typeof token !== 'string') return { ok: false, error: 'BAD_TOKEN' };
    try {
        const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
        const sub = String(decoded.sub || '');
        if (!sub) return { ok: false, error: 'MISSING_SUB' };
        const roles = Array.isArray(decoded.roles) ? decoded.roles.map(String) : [];
        return { ok: true, admin: { id: sub, roles } };
    } catch (err) {
        if (err.name === 'TokenExpiredError') return { ok: false, error: 'TOKEN_EXPIRED' };
        if (err.name === 'JsonWebTokenError') return { ok: false, error: 'MALFORMED_TOKEN' };
        if (err.name === 'NotBeforeError') return { ok: false, error: 'TOKEN_NOT_ACTIVE' };
        return { ok: false, error: 'INVALID_SIGNATURE' };
    }
};

module.exports = { verifyToken };

