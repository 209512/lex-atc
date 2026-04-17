// backend/index.js
require('./src/utils/apm.js');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const promClient = require('prom-client');
const { RateLimiter, createRateLimitMiddleware } = require('./src/core/security/RateLimit');
const { requireAdminAuth } = require('./src/core/security/AdminAuth');
const { validateBody } = require('./src/core/security/Validate');
const { loadBackendConfig } = require('./src/config/env');
const { SYSTEM } = require('@lex-atc/shared');
const atcService = require('./src/services/atc.service');
const SSEService = require('./src/services/SSEService');
const db = require('./src/core/DatabaseManager');
const logger = require('./src/utils/logger');

let globalServer = null;

const shutdown = async (signal) => {
  logger.info(`\n[Process] Received ${signal}. Starting graceful shutdown...`);
  if (globalServer) {
    globalServer.close(async () => {
      logger.info('[Process] HTTP server closed.');
      try {
        const app = globalServer.app;
        if (app?.sseService?.shutdown) {
          try { await app.sseService.shutdown(); } catch (e) { logger.error('SSE shutdown error:', e.message); }
        }
        if (app?.limiter?.close) {
          try { app.limiter.close(); } catch (e) { logger.error('Limiter close error:', e.message); }
        }
        
        // Ensure JobQueue is shut down cleanly to prevent hanging Redis/BullMQ instances
        try {
            const JobQueue = require('./src/core/queue/JobQueue');
            await JobQueue.closeAll();
        } catch(e) { logger.error('JobQueue shutdown error:', e.message); }
        
        if (db && typeof db.stop === 'function') {
          try { db.stop(); } catch (e) { logger.error('DB stop error:', e.message); }
        }
        if (atcService && typeof atcService.shutdown === 'function') {
          try { await atcService.shutdown(); } catch (e) { logger.error('ATC shutdown error:', e.message); }
          logger.info('[Process] ATC Service shut down cleanly.');
        } else if (atcService && typeof atcService.stop === 'function') {
          try { await atcService.stop(); } catch (e) { logger.error('ATC stop error:', e.message); }
          logger.info('[Process] ATC Service stopped cleanly.');
        }

        setTimeout(() => {
            logger.info('[Process] Forcing exit after shutdown delay...');
            process.exit(0);
        }, 1500).unref();
        process.exit(0);
      } catch (e) {
        logger.error('[Process] Error during shutdown:', e);
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.error('[Process] Uncaught Exception:', error);
  shutdown('uncaughtException');
});

const PORT = process.env.PORT || 3000;

const buildApp = (svc, cfg = null, deps = {}) => {
  cfg = cfg || loadBackendConfig(process.env);
  const app = express();
  if (Number(cfg.server.trustProxyHops || 0) > 0) {
    app.set('trust proxy', Number(cfg.server.trustProxyHops));
  }

  app.use(helmet());
  
  const allowedOrigins = cfg.cors.allowedOrigins;

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) {
      return cb(null, true); // Allow server-to-server or non-browser requests
    }
    const allowLocalWildcard = String(process.env.CORS_ALLOW_LOCALHOST_WILDCARD || '').toLowerCase() === 'true';
    if (allowLocalWildcard && /^(http:\/\/(localhost|127\.0\.0\.1):\d+)$/.test(origin)) {
      return cb(null, true);
    }
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error('CORS_DENIED'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'PUT', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-wallet-signature', 'x-wallet-pubkey', 'x-timestamp'],
}));

app.use((err, _req, res, next) => {
  if (err && String(err.message) === 'CORS_DENIED') return res.status(403).json({ error: 'CORS_DENIED' });
  return next(err);
});

app.use(express.json({ limit: cfg.server.jsonBodyLimit }));

const limiter = new RateLimiter();
app.limiter = limiter; // Export for testing/shutdown
app.use(createRateLimitMiddleware(limiter, { limit: cfg.rateLimit.global.limit, windowMs: cfg.rateLimit.global.windowMs, prefix: 'global' }));
const adminRate = createRateLimitMiddleware(limiter, { limit: cfg.rateLimit.admin.limit, windowMs: cfg.rateLimit.admin.windowMs, prefix: 'admin' });

// Prometheus Metrics Setup
promClient.register.clear();
promClient.collectDefaultMetrics({ prefix: 'lex_atc_' });

const activeAgentsGauge = new promClient.Gauge({
  name: 'lex_atc_active_agents',
  help: 'Number of active AI agents in the system'
});

const lockOccupancyGauge = new promClient.Gauge({
  name: 'lex_atc_lock_occupancy_ms',
  help: 'Time in milliseconds the global lock has been held',
  labelNames: ['shard_id', 'holder', 'balance', 'total_tasks']
});

const anomalyScoreGauge = new promClient.Gauge({
  name: 'lex_atc_ml_anomaly_score',
  help: 'Latest ML Watcher anomaly score for agents',
  labelNames: ['agent_uuid', 'balance', 'total_tasks']
});

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

app.get('/metrics', asyncRoute(async (req, res) => {
    activeAgentsGauge.set(svc.agents.size);
    
    // Update Lock Occupancy
    if (svc.state.holder && svc.state.lockAcquiredAt) {
      const holderAgent = svc.agents.get(svc.state.holder);
      const balance = holderAgent ? (holderAgent.account?.balance || 0) : 0;
      const totalTasks = holderAgent ? (holderAgent.stats?.totalTasks || 0) : 0;
      lockOccupancyGauge.labels('RG-0', svc.state.holder, String(balance), String(totalTasks)).set(Date.now() - svc.state.lockAcquiredAt);
    } else {
      lockOccupancyGauge.labels('RG-0', 'none', '0', '0').set(0);
    }

    // Update Anomaly Scores
    for (const [uuid, agent] of svc.agents.entries()) {
      if (agent.metrics && agent.metrics.anomalyScore !== undefined) {
        const balance = agent.account?.balance || 0;
        const totalTasks = agent.stats?.totalTasks || 0;
        anomalyScoreGauge.labels(uuid, String(balance), String(totalTasks)).set(agent.metrics.anomalyScore);
      }
    }

    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
}));

require("./src/routes/alert.routes")(app, svc, { globalRate: limiter ? createRateLimitMiddleware(limiter, { limit: cfg.rateLimit.global.limit, windowMs: cfg.rateLimit.global.windowMs, prefix: 'alerts' }) : (req, res, next) => next() });


const authOperator = requireAdminAuth({ requiredRoles: ['operator', 'governor', 'executor'] });
const authGovernor = requireAdminAuth({ requiredRoles: ['governor', 'executor'] });
const authExecutor = requireAdminAuth({ requiredRoles: ['executor'] });

if (deps.sseService) {
    deps.sseService.attachRoute(app, { authStream: authOperator });
}

app.use('/api', (req, res, next) => {
    // Readiness Probe
    if (req.path === '/health' || req.path === '/ready' || req.path === '/doctor') return next();
    if (cfg.nodeEnv === 'test') return next(); // Bypass readiness check in tests
    if (!svc.isReady) {
        return res.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'Service is starting up' });
    }
    next();
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', ready: Boolean(svc.isReady) });
});

app.get('/api/ready', (req, res) => {
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
    } catch (e) {
        hzOk = false;
    }
    checks.hazelcast = { ok: hzOk, details: { members: hzMembers } };

    const failed = Object.values(checks).filter(c => c && c.ok === false).length;
    res.status(failed ? 503 : 200).json({ status: failed ? 'fail' : 'ok', failed, checks });
}));

require("./src/routes/api.routes")(app, svc, { adminRate, authOperator, authGovernor, authExecutor });


app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'ROUTE_NOT_FOUND' });
});

app.use((err, _req, res, _next) => {
  const message = String(err?.message || 'INTERNAL_SERVER_ERROR');
  if (err instanceof SyntaxError) return res.status(400).json({ error: 'BAD_JSON_BODY' });
  if (message === 'CORS_DENIED') return res.status(403).json({ error: 'CORS_DENIED' });
  
  // Mask internal server errors in production, but log them
  logger.error('API route failed:', err);
  
  if (cfg.nodeEnv === 'production') {
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' });
  }
  return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message });
});

return app;
};

// DO NOT create an app instance in global scope to prevent side effects in tests.
// The real startup logic is encapsulated in the `start` function.

const start = async ({ port = PORT, initialAgents = 2 } = {}) => {
  require('dotenv').config();
  const cfg = loadBackendConfig(process.env);

  let sseService = null;
  if (process.env.NODE_ENV !== 'test') {
      sseService = new SSEService(atcService, cfg);
      sseService.init();
  }

  let app;
  try {
    app = buildApp(atcService, cfg, { sseService });
  } catch (err) {
    logger.error('❌ Failed to build app:', err.message);
    if (process.env.NODE_ENV === 'production') {
      logger.error('❌ FATAL: Cannot bypass auth in production. Shutting down.');
      process.exit(1);
    } else if (String(process.env.ALLOW_DEV_AUTH_FALLBACK || '').toLowerCase() === 'true') {
      logger.warn('⚠️ Falling back to mocked initialization (Admin Auth Disabled) for development.');
      app = buildApp(atcService, loadBackendConfig({
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || 'development',
        ADMIN_AUTH_DISABLED: process.env.ADMIN_AUTH_DISABLED || 'true'
      }), { sseService });
    } else {
      throw err;
    }
  }

  app.sseService = sseService; // attach for graceful shutdown

  await atcService.init(initialAgents);
  logger.info('✅ System Initialized. Starting Web Server...');

  globalServer = app.listen(port, '0.0.0.0', () => {
    logger.info(`Server running on port ${port}`);
  });
  globalServer.app = app;

  return globalServer;
};

module.exports = { start, buildApp };

if (require.main === module) {
  start({
    port: process.env.PORT || PORT,
    initialAgents: Number(process.env.INIT_AGENTS || 2)
  }).catch(err => {
    logger.error('❌ Critical Initialization Failure:', err.message);
    process.exit(1);
  });
}
