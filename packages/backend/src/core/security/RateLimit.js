const keyFromReq = (req) => {
    const trust = Number.parseInt(String(process.env.TRUST_PROXY_HOPS || '0'), 10);
    if (trust > 0) {
        const fwd = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim();
        if (fwd) return fwd;
    }
    return req.ip || 'unknown';
};

class RateLimiter {
    constructor({ now = () => Date.now(), cleanupIntervalMs = 60000 } = {}) {
        this.now = now;
        this.buckets = new Map();
        
        // Fix memory leak: cleanup expired buckets periodically
        this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
        if (this.cleanupInterval.unref) {
            this.cleanupInterval.unref();
        }
    }

    cleanup() {
        const now = this.now();
        for (const [k, b] of this.buckets.entries()) {
            if (now > b.resetAt) {
                this.buckets.delete(k);
            }
        }
    }

    allow(key, { limit, windowMs }) {
        const now = this.now();
        const k = String(key);
        const b = this.buckets.get(k) || { count: 0, resetAt: now + windowMs };
        if (now > b.resetAt) {
            b.count = 0;
            b.resetAt = now + windowMs;
        }
        b.count += 1;
        this.buckets.set(k, b);
        return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), resetAt: b.resetAt };
    }
    
    close() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

const createRateLimitMiddleware = (limiter, { limit, windowMs, prefix = 'rl' }) => {
    return (req, res, next) => {
        const key = `${prefix}:${keyFromReq(req)}:${req.path}`;
        const r = limiter.allow(key, { limit, windowMs });
        res.setHeader('X-RateLimit-Limit', String(limit));
        res.setHeader('X-RateLimit-Remaining', String(r.remaining));
        res.setHeader('X-RateLimit-Reset', String(Math.floor(r.resetAt / 1000)));
        if (!r.ok) return res.status(429).json({ error: 'RATE_LIMITED' });
        return next();
    };
};

module.exports = { RateLimiter, createRateLimitMiddleware };
