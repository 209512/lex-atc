const renewLeader = async (sse) => {
    const redisConfigured = Boolean(process.env.REDIS_URL || process.env.REDIS_SENTINELS);
    const allowUnsafeLocalLeader =
        String(process.env.SSE_UNSAFE_SINGLE_INSTANCE_FALLBACK || '').toLowerCase() === 'true' ||
        (!redisConfigured && process.env.NODE_ENV !== 'production');
    if (!sse.redisPub || sse.redisPub.status !== 'ready') {
        sse.isLeader = allowUnsafeLocalLeader;
        return;
    }
    const key = 'atc:sse:publisher';
    const ttlMs = 4000;
    try {
        if (sse.isLeader) {
            const res = await sse.redisPub.set(key, sse.publisherId, 'PX', ttlMs, 'XX');
            if (res !== 'OK') sse.isLeader = false;
            return;
        }
        const res = await sse.redisPub.set(key, sse.publisherId, 'PX', ttlMs, 'NX');
        if (res === 'OK') sse.isLeader = true;
    } catch {
        sse.isLeader = allowUnsafeLocalLeader;
    }
};

module.exports = { renewLeader };

