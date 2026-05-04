const Redis = require('ioredis');
const logger = require('../../../utils/logger');

const initRedis = (manager, cfg) => {
    if (!((process.env.REDIS_URL || process.env.REDIS_SENTINELS) && manager.mode !== 'memory')) return null;

    if (process.env.REDIS_SENTINELS) {
        const sentinels = process.env.REDIS_SENTINELS.split(',').map(s => {
            const [host, port] = s.split(':');
            return { host, port: parseInt(port, 10) };
        });
        manager.redis = new Redis({
            sentinels,
            name: process.env.REDIS_SENTINEL_NAME || 'mymaster',
            password: process.env.REDIS_PASSWORD || undefined,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            retryStrategy(times) { return Math.min(times * 50, 2000); }
        });
    } else {
        manager.redis = new Redis(process.env.REDIS_URL, {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            retryStrategy(times) { return Math.min(times * 50, 2000); }
        });
    }

    manager.redis.on('error', (err) => {
        const now = Date.now();
        if (now - manager._lastRedisErrorAt > 5000) {
            manager._lastRedisErrorAt = now;
            logger.warn('[DatabaseManager] Redis error:', err.message);
        }
    });

    return manager.redis;
};

const stopRedis = (manager) => {
    if (!manager.redis) return;
    try { manager.redis.disconnect(); } catch (e) { logger.debug(`Redis disconnect error: ${e.message}`); }
    manager.redis = null;
};

module.exports = {
    initRedis,
    stopRedis,
};

