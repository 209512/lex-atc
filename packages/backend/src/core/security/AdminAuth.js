const crypto = require('crypto');
const { PublicKey } = require('@solana/web3.js');
const nacl = require('tweetnacl'); // Usually bundled with solana/web3.js
const bs58 = require('bs58'); // Usually bundled with solana/web3.js
const logger = require('../../utils/logger');
const jwt = require('jsonwebtoken');

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
        try {
            return decodeURIComponent(v);
        } catch {
            return v;
        }
    }
    return null;
};

const parseSolanaAllowlist = () => {
    const raw = process.env.ADMIN_SOLANA_ALLOWLIST_JSON;
    if (!raw) return null;
    try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return null;
        const map = new Map();
        for (const item of arr) {
            const pubkey = String(item?.pubkey || item?.id || '');
            if (!pubkey) continue;
            const roles = Array.isArray(item?.roles) ? item.roles.map(String) : [];
            map.set(pubkey, roles);
        }
        return map;
    } catch {
        return null;
    }
};

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

// [Web3 Multi-sig & Solana Signature Verification]
// Supports M-of-N threshold signatures for admin actions
const verifySolanaSignature = (req) => {
    try {
        let signatures = [];
        let pubkeys = [];
        const timestamp = req.headers['x-timestamp'];

        if (req.headers['x-wallet-signatures'] && req.headers['x-wallet-pubkeys']) {
            signatures = JSON.parse(req.headers['x-wallet-signatures']);
            pubkeys = JSON.parse(req.headers['x-wallet-pubkeys']);
        } else if (req.headers['x-wallet-signature'] && req.headers['x-wallet-pubkey']) {
            signatures = [req.headers['x-wallet-signature']];
            pubkeys = [req.headers['x-wallet-pubkey']];
        }

        if (!signatures.length || !pubkeys.length || signatures.length !== pubkeys.length || !timestamp) return false;

        // Replay attack prevention: timestamp within 5 minutes
        const now = Date.now();
        if (Math.abs(now - Number(timestamp)) > 300000) return false;

        const nodeEnv = String(process.env.NODE_ENV || 'development');
        const allowlist = parseSolanaAllowlist();

        // Reconstruct the message that was signed
        // Prevent body serialization mismatch by using the raw body buffer if available
        let payload = req.method === 'GET' ? req.url : '';
        if (req.method !== 'GET') {
            payload = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
        }
        
        const message = `lex-atc-auth|${timestamp}|${payload}`;
        const messageBytes = new TextEncoder().encode(message);

        let validCount = 0;
        const validPubkeys = [];
        
        for (let i = 0; i < signatures.length; i++) {
            const currentPubkey = pubkeys[i];
            // Verify if pubkey is in allowlist before validating signature (production only)
            if (nodeEnv === 'production' && (!allowlist || !allowlist.has(currentPubkey))) {
                continue;
            }

            try {
                const signatureBytes = bs58.decode(signatures[i]);
                const publicKeyBytes = new PublicKey(currentPubkey).toBytes();
                
                if (nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)) {
                    validCount++;
                    validPubkeys.push(currentPubkey);
                }
            } catch (innerErr) {
                // Ignore invalid individual signature, continue checking others
            }
        }

        // Define required threshold
        // Use 1 for single signature, otherwise fallback to env or 2
        const isSingleSig = signatures.length === 1;
        const MULTI_SIG_THRESHOLD = isSingleSig ? 1 : Number(process.env.ADMIN_MULTI_SIG_THRESHOLD || 2);
        
        if (validCount >= MULTI_SIG_THRESHOLD) {
            return { ok: true, pubkeys: validPubkeys, allowlist };
        }
        return false;
    } catch (err) {
        return false;
    }
};

const requireAdminAuth = (opts = {}) => {
    const {
        requiredRoles = [],
        allowWhenDisabled = true,
    } = opts;

    return (req, res, next) => {
        const disabled = String(process.env.ADMIN_AUTH_DISABLED || '').toLowerCase() === 'true';
        const nodeEnv = String(process.env.NODE_ENV || 'development');
        const secret = process.env.ADMIN_TOKEN_SECRET;

        if (disabled) {
            if (allowWhenDisabled) {
                if (nodeEnv === 'production') {
                    logger.warn('⚠️ [SECURITY] Admin auth is disabled in PRODUCTION.');
                }
                req.admin = { id: 'DEMO_ADMIN', roles: ['root', 'governor', 'operator', 'executor'] };
                return next();
            }
            return res.status(503).json({ error: 'ADMIN_AUTH_DISABLED_IN_PRODUCTION' });
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

module.exports = { requireAdminAuth, verifyToken, verifySolanaSignature };
