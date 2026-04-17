const parseBool = (v, def = false) => {
    if (v === undefined || v === null || v === '') return def;
    const s = String(v).toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
    return def;
};

const parseIntStrict = (v, def) => {
    if (v === undefined || v === null || v === '') return def;
    const n = Number.parseInt(String(v), 10);
    return Number.isFinite(n) ? n : def;
};

const parseNumberStrict = (v, def) => {
    if (v === undefined || v === null || v === '') return def;
    const n = Number(String(v));
    return Number.isFinite(n) ? n : def;
};

const parseCsv = (v) => {
    if (!v) return [];
    return String(v)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
};

const requireOneOf = (env, names, label) => {
    for (const n of names) {
        if (env[n] !== undefined && env[n] !== null && String(env[n]).length > 0) return;
    }
    throw new Error(`Missing required env: ${label} (${names.join(' or ')})`);
};

const collectMissing = (env, requiredNames) => {
    const missing = [];
    for (const n of requiredNames) {
        if (!env[n] || String(env[n]).length === 0) missing.push(n);
    }
    return missing;
};

const loadBackendConfig = (env = process.env) => {
    const nodeEnv = String(env.NODE_ENV || 'development');
    const isProd = nodeEnv === 'production';
    const isTest = nodeEnv === 'test';

    let dbMode = String(env.DB_MODE || '').toLowerCase();
    if (!dbMode) {
        if (isTest) {
            dbMode = 'memory';
        } else if (env.DATABASE_URL || env.PGHOST) {
            dbMode = 'pg';
        } else {
            dbMode = 'memory';
        }
    }

    const config = {
        nodeEnv,
        server: {
            port: parseIntStrict(env.PORT, 3000),
            initAgents: parseIntStrict(env.INIT_AGENTS, 2),
            jsonBodyLimit: String(env.JSON_BODY_LIMIT || '256kb'),
            trustProxyHops: parseIntStrict(env.TRUST_PROXY_HOPS, 0),
        },
        cors: {
            allowedOrigins: parseCsv(env.CORS_ALLOWED_ORIGINS || ''),
        },
        rateLimit: {
            global: {
                limit: parseIntStrict(env.RATE_LIMIT_GLOBAL_LIMIT, 240),
                windowMs: parseIntStrict(env.RATE_LIMIT_GLOBAL_WINDOW_MS, 60_000),
            },
            admin: {
                limit: parseIntStrict(env.RATE_LIMIT_ADMIN_LIMIT, 60),
                windowMs: parseIntStrict(env.RATE_LIMIT_ADMIN_WINDOW_MS, 60_000),
            },
        },
        db: {
            mode: dbMode,
            url: env.DATABASE_URL || null,
            pg: {
                host: env.PGHOST || null,
                port: parseIntStrict(env.PGPORT, 5432),
                user: env.PGUSER || null,
                password: env.PGPASSWORD || null,
                database: env.PGDATABASE || null,
            },
            memoryNamespace: String(env.DB_MEMORY_NAMESPACE || 'default'),
        },
        hazelcast: {
            useLocal: parseBool(env.USE_LOCAL_HZ, true),
            clusterName: String(env.HZ_CLUSTER_NAME || 'dev'),
            address: parseCsv(env.HZ_ADDRESS || 'hazelcast:5701'),
            cloudUrl: String(env.HZ_CLOUD_URL || 'https://api.viridian.hazelcast.com'),
            discoveryToken: env.HAZELCAST_DISCOVERY_TOKEN || null,
            password: env.HAZELCAST_PASSWORD || null,
            certKeyPath: env.HZ_CERT_KEY_PATH || null,
            certPath: env.HZ_CERT_PATH || null,
            caPath: env.HZ_CA_PATH || null,
            timeouts: {
                connectionTimeoutMs: parseIntStrict(env.HZ_CONNECTION_TIMEOUT_MS, 10_000),
                heartbeatIntervalMs: parseIntStrict(env.HZ_HEARTBEAT_INTERVAL_MS, 5_000),
                heartbeatTimeoutMs: parseIntStrict(env.HZ_HEARTBEAT_TIMEOUT_MS, 60_000),
                invocationTimeoutMs: parseIntStrict(env.HZ_INVOCATION_TIMEOUT_MS, 120_000),
                retryInitialBackoffMs: parseIntStrict(env.HZ_RETRY_INITIAL_BACKOFF_MS, 1_000),
                retryMaxBackoffMs: parseIntStrict(env.HZ_RETRY_MAX_BACKOFF_MS, 30_000),
                retryMultiplier: parseIntStrict(env.HZ_RETRY_MULTIPLIER, 2),
                clusterConnectTimeoutMs: parseIntStrict(env.HZ_CLUSTER_CONNECT_TIMEOUT_MS, -1),
            },
        },
        adminAuth: {
            disabled: parseBool(env.ADMIN_AUTH_DISABLED, false),
            tokenSecret: env.ADMIN_TOKEN_SECRET || null,
            multiSigThreshold: parseIntStrict(env.ADMIN_MULTI_SIG_THRESHOLD, 2),
        },
        ai: {
            useMock: parseBool(env.USE_MOCK_AI, true),
            mlInferenceApiUrl: env.ML_INFERENCE_API_URL || null,
        },
        governance: {
            timelockMs: parseIntStrict(env.GOVERNANCE_TIMELOCK_MS, 10_000),
            approvalThreshold: parseIntStrict(env.GOVERNANCE_APPROVAL_THRESHOLD, 1),
            approvalTotal: parseIntStrict(env.GOVERNANCE_APPROVAL_TOTAL, 1),
            membersJson: env.GOVERNANCE_MEMBERS_JSON || null,
            gcTtlMs: parseIntStrict(env.GC_TTL_MS, 24 * 60 * 60 * 1000),
            gcMaxItems: parseIntStrict(env.GC_MAX_ITEMS, 5000),
        },
        isolation: {
            taskTimeoutMs: parseIntStrict(env.ISOLATION_TASK_TIMEOUT_MS, 15_000),
            pollIntervalMs: parseIntStrict(env.ISOLATION_POLL_INTERVAL_MS, 250),
            gcTtlMs: parseIntStrict(env.GC_TTL_MS, 24 * 60 * 60 * 1000),
            gcMaxItems: parseIntStrict(env.GC_MAX_ITEMS, 5000),
        },
        settlement: {
            intervalMs: parseIntStrict(env.SETTLEMENT_INTERVAL_MS ?? env.SETTLEMENT_SNAPSHOT_INTERVAL_MS, 5_000),
            disputeWindowMs: parseIntStrict(env.SETTLEMENT_DISPUTE_WINDOW_MS, 60_000),
            staleMs: parseIntStrict(env.SETTLEMENT_STALE_MS, 30_000),
        },
        lock: {
            leaseMs: parseIntStrict(env.LOCK_LEASE_MS, 4_000),
            timeoutMs: parseIntStrict(env.LOCK_TIMEOUT, 5_000),
            monitorIntervalMs: parseIntStrict(env.MONITOR_INTERVAL_MS, 100),
            heartbeatStaleMs: parseIntStrict(env.HEARTBEAT_STALE_MS, 600),
            activityStaleMs: parseIntStrict(env.ACTIVITY_STALE_MS, 5_000),
        },
        escalation: {
            stepMs: parseIntStrict(env.ESCALATION_STEP_MS, 1_500),
            baseFee: parseNumberStrict(env.ESCALATION_BASE_FEE, 0.002),
            multiplier: parseNumberStrict(env.ESCALATION_MULTIPLIER, 1.7),
        },
        limits: {
            maxAgentCount: parseIntStrict(env.MAX_AGENT_COUNT, 10),
            maxCandidateNumber: parseIntStrict(env.MAX_CANDIDATE_NUMBER, 100),
        },
        wallet: {
            solanaRpcUrl: env.SOLANA_RPC_URL || null,
            agentKeySeedPresent: Boolean(env.AGENT_KEY_SEED),
            treasuryKeySeedPresent: Boolean(env.TREASURY_KEY_SEED),
        },
    };

    const missing = [];

    if (isProd) {
        if (config.cors.allowedOrigins.length === 0 && !env.CORS_ALLOW_LOCALHOST_WILDCARD) {
            missing.push('CORS_ALLOWED_ORIGINS');
        }
        if (!config.adminAuth.disabled) {
            missing.push(...collectMissing(env, ['ADMIN_TOKEN_SECRET']));
        }
        if (config.db.mode !== 'memory') {
            if (!config.db.url) {
                try {
                    requireOneOf(env, ['PGHOST', 'DATABASE_URL'], 'database connection');
                } catch {
                    missing.push('DATABASE_URL (or PGHOST/PGUSER/PGPASSWORD/PGDATABASE)');
                }
            }
        }
    }

    if (missing.length > 0) {
        const msg = `Missing required env for ${nodeEnv}: ${missing.join(', ')}`;
        const err = new Error(msg);
        err.code = 'ENV_MISSING';
        throw err;
    }

    return config;
};

module.exports = { loadBackendConfig };
