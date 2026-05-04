const db = require('../core/DatabaseManager');

module.exports = function setupHealth(app, svc, cfg, deps = {}) {
    const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

    app.use('/api', (req, res, next) => {
        if (req.path === '/health' || req.path === '/ready' || req.path === '/doctor') return next();
        if (cfg.nodeEnv === 'test') return next();
        if (!svc.isReady) {
            return res.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'Service is starting up' });
        }
        next();
    });

    app.get('/api/health', (_req, res) => {
        res.json({ status: 'ok', ready: Boolean(svc.isReady) });
    });

    app.get('/api/ready', (_req, res) => {
        if (svc.isReady) return res.json({ status: 'ready' });
        res.status(503).json({ status: 'starting' });
    });

    app.get('/api/doctor', asyncRoute(async (_req, res) => {
        const checks = {};

        const withTimeout = async (p, ms) => {
            return Promise.race([
                p,
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
            ]);
        };

        checks.node = {
            ok: true,
            details: {
                pid: process.pid,
                node: process.version,
                uptimeSec: Math.round(process.uptime()),
            }
        };

        checks.atc = {
            ok: Boolean(svc.isReady),
            details: {
                ready: Boolean(svc.isReady),
                agents: svc.agents.size,
                shards: Object.keys(svc.state.shards || {}).length,
                globalStop: Boolean(svc.state.globalStop),
            }
        };

        let pgOk = true;
        let pgError = null;
        const mode = String(db.mode || 'unknown');
        const pgConfigured = Boolean(process.env.DATABASE_URL) || Boolean(process.env.PGHOST);
        if (mode !== 'memory') {
            try {
                if (!db.pool) throw new Error('PG_POOL_MISSING');
                await withTimeout(db.pool.query('SELECT 1'), 750);
            } catch (e) {
                pgOk = false;
                pgError = String(e?.message || e);
            }
        } else if (pgConfigured) {
            pgOk = false;
            pgError = 'PG_FALLBACK_ACTIVE';
        }
        checks.postgres = { ok: pgOk, details: { mode, error: pgError } };

        const redisConfigured = Boolean(process.env.REDIS_URL) || Boolean(process.env.REDIS_SENTINELS);
        const dbRedisStatus = db.redis ? String(db.redis.status || 'unknown') : null;
        const sseRedisStatus = (deps.sseService && deps.sseService.redisPub) ? String(deps.sseService.redisPub.status || 'unknown') : null;

        let dbPingOk = null;
        let dbPingErr = null;
        if (db.redis && typeof db.redis.ping === 'function') {
            try {
                await withTimeout(db.redis.ping(), 750);
                dbPingOk = true;
            } catch (e) {
                dbPingOk = false;
                dbPingErr = String(e?.message || e);
            }
        }

        let ssePingOk = null;
        let ssePingErr = null;
        if (deps.sseService?.redisPub && typeof deps.sseService.redisPub.ping === 'function') {
            try {
                await withTimeout(deps.sseService.redisPub.ping(), 750);
                ssePingOk = true;
            } catch (e) {
                ssePingOk = false;
                ssePingErr = String(e?.message || e);
            }
        }

        const redisOk = !redisConfigured || Boolean(dbPingOk) || Boolean(ssePingOk);
        checks.redis = {
            ok: redisOk,
            details: {
                configured: redisConfigured,
                db: { status: dbRedisStatus, pingOk: dbPingOk, pingError: dbPingErr },
                sse: { status: sseRedisStatus, pingOk: ssePingOk, pingError: ssePingErr },
            }
        };

        let hzOk = Boolean(svc.sharedClient);
        let hzMembers = null;
        try {
            if (svc.sharedClient && typeof svc.sharedClient.getCluster === 'function') {
                const cluster = svc.sharedClient.getCluster();
                const members = cluster && cluster.getMembers ? cluster.getMembers() : null;
                hzMembers = Array.isArray(members) ? members.length : (members && typeof members.size === 'number' ? members.size : null);
            }
        } catch (_e) {
            hzOk = false;
        }
        checks.hazelcast = { ok: hzOk, details: { members: hzMembers } };

        const failed = Object.values(checks).filter(c => c && c.ok === false).length;
        res.status(failed ? 503 : 200).json({ status: failed ? 'fail' : 'ok', failed, checks });
    }));
};

