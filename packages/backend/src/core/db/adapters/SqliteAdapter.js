const path = require('path');
const fs = require('fs');
const logger = require('../../../utils/logger');

class SqliteAdapter {
    constructor() {
        this.db = null;
        this.poolMock = null;
    }

    async init() {
        const sqlite3 = require('sqlite3').verbose();
        const dbPath = path.join(process.cwd(), 'local-atc.sqlite');
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                logger.error('[SqliteAdapter] Error opening database:', err.message);
            } else {
                logger.info('[SqliteAdapter] Connected to SQLite database at', dbPath);
            }
        });

        // Initialize Schema if empty
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS event_logs_p0 (
                id UUID PRIMARY KEY,
                global_seq BIGINT NOT NULL,
                shard_id VARCHAR(255) NOT NULL,
                shard_seq BIGINT NOT NULL,
                shard_epoch BIGINT NOT NULL,
                resource_id VARCHAR(255),
                fence_token VARCHAR(255),
                actor_uuid VARCHAR(255),
                action VARCHAR(255),
                correlation_id VARCHAR(255) UNIQUE,
                payload JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS shard_checkpoints (
                shard_id VARCHAR(255) PRIMARY KEY,
                last_shard_seq BIGINT NOT NULL,
                last_global_seq BIGINT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS channel_snapshots (
                channel_id VARCHAR(255) PRIMARY KEY,
                status VARCHAR(50) NOT NULL,
                state_hash VARCHAR(255),
                last_nonce BIGINT DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Mock pg pool interface
        this.poolMock = {
            connect: async () => ({
                query: async (sql, params) => this.query(sql, params),
                release: () => {}
            }),
            query: async (sql, params) => this.query(sql, params),
            end: async () => {
                return new Promise((resolve) => {
                    this.db.close(() => resolve());
                });
            }
        };
    }

    getPool() {
        return this.poolMock;
    }

    async stop() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close(() => {
                    this.db = null;
                    resolve();
                });
            });
        }
    }

    runQuery(sql) {
        return new Promise((resolve, reject) => {
            this.db.exec(sql, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    query(sql, params = []) {
        return new Promise((resolve, reject) => {
            // Replace $1, $2, etc with ?
            const sqliteSql = sql.replace(/\$\d+/g, '?');
                        
            if (sqliteSql.trim().toUpperCase().startsWith('SELECT') || sqliteSql.trim().toUpperCase().startsWith('WITH')) {
                this.db.all(sqliteSql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve({ rows, rowCount: rows.length });
                });
            } else {
                this.db.run(sqliteSql, params, function(err) {
                    if (err) reject(err);
                    else resolve({ rowCount: this.changes, lastID: this.lastID });
                });
            }
        });
    }
}

module.exports = SqliteAdapter;