const { Pool } = require('pg');
const knex = require('knex');
const { loadBackendConfig } = require('../../../config/env');
const path = require('path');
const logger = require('../../../utils/logger');

const buildPgConnectionString = (cfg) => {
    if (cfg?.db?.url) return cfg.db.url;
    const host = cfg?.db?.pg?.host;
    const port = cfg?.db?.pg?.port;
    const user = cfg?.db?.pg?.user;
    const password = cfg?.db?.pg?.password;
    const database = cfg?.db?.pg?.database;
    if (!host || !port || !user || !password || !database) return null;
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
};

class PostgresAdapter {
    constructor() {
        this.pool = null;
    }

    async init() {
        const cfg = loadBackendConfig(process.env);
        const connectionString = buildPgConnectionString(cfg);
        
        if (!connectionString) {
            const err = new Error('Database config missing: set DATABASE_URL or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE');
            err.code = 'ENV_MISSING_DB';
            throw err;
        }
        const maxAttempts = Number(process.env.PG_INIT_MAX_ATTEMPTS || 15);
        const backoffMs = Number(process.env.PG_INIT_BACKOFF_MS || 1000);
        let lastErr = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                this.pool = new Pool({ 
                    connectionString,
                    max: 20,
                    idleTimeoutMillis: 30000,
                    connectionTimeoutMillis: 5000,
                });

                this.pool.on('error', (err) => {
                    logger.error('[PostgresAdapter] Unexpected error on idle client (HA failover?)', err.message);
                });

                await this.pool.query('SELECT 1');

                const knexClient = knex({
                    client: 'pg',
                    connection: connectionString,
                    migrations: {
                        directory: path.join(__dirname, '../../../../migrations'),
                        tableName: 'knex_migrations'
                    }
                });
                await knexClient.migrate.latest();
                await knexClient.destroy();
                logger.info(`[PostgresAdapter] Successfully connected to database after ${attempt} attempts`);
                return;
            } catch (error) {
                lastErr = error;
                try {
                    if (this.pool) await this.pool.end();
                } catch (e) {
                    logger.error('Pool end error:', e.message);
                }
                this.pool = null;
                
                logger.warn(`[PostgresAdapter] Connection failed (Attempt ${attempt}/${maxAttempts}): ${error.message}`);
                
                if (attempt === maxAttempts) break;
                await new Promise(r => setTimeout(r, backoffMs));
            }
        }

        throw lastErr || new Error('PG_INIT_FAILED');
    }

    getPool() {
        return this.pool;
    }

    async stop() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
    }
}

module.exports = PostgresAdapter;
