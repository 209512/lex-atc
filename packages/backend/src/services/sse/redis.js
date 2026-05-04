const Redis = require('ioredis');
const logger = require('../../utils/logger');

const initRedis = (sse) => {
    if (!(process.env.REDIS_URL || process.env.REDIS_SENTINELS)) return;

    const opts = { maxRetriesPerRequest: null, enableReadyCheck: false, retryStrategy(times) { return Math.min(times * 50, 2000); } };
    if (process.env.REDIS_SENTINELS) {
        const sentinels = process.env.REDIS_SENTINELS.split(',').map(s => {
            const [host, port] = s.split(':');
            return { host, port: parseInt(port, 10) };
        });
        opts.sentinels = sentinels;
        opts.name = process.env.REDIS_SENTINEL_NAME || 'mymaster';
        opts.password = process.env.REDIS_PASSWORD || undefined;
        sse.redisSub = new Redis(opts);
        sse.redisPub = new Redis(opts);
    } else {
        sse.redisSub = new Redis(process.env.REDIS_URL, opts);
        sse.redisPub = new Redis(process.env.REDIS_URL, opts);
    }

    const onErr = (prefix) => (err) => {
        const now = Date.now();
        if (now - sse._lastRedisErrorAt > 5000) {
            sse._lastRedisErrorAt = now;
            logger.warn(`[SSE Redis] ${prefix} error:`, err.message);
        }
    };
    sse.redisSub.on('error', onErr('Sub'));
    sse.redisPub.on('error', onErr('Pub'));

    sse.redisSub.subscribe('atc:sse:state', (err) => {
        if (err) logger.error('[SSE Redis] Subscribe error:', err.message);
        else logger.info('[SSE Redis] Subscribed to atc:sse:state');
    });

    sse.redisSub.on('message', (channel, message) => {
        if (channel === 'atc:sse:state') {
            sse.lastWire = message;
            sse.broadcastSSE(message);
        }
    });
};

const shutdownRedis = (sse) => {
    if (sse.redisSub) sse.redisSub.disconnect();
    if (sse.redisPub) sse.redisPub.disconnect();
    sse.redisSub = null;
    sse.redisPub = null;
};

module.exports = {
    initRedis,
    shutdownRedis,
};

