const { loadBackendConfig } = require('./src/config/env');

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

const cfg = loadBackendConfig(process.env);
const connectionString = buildPgConnectionString(cfg);

module.exports = {
  client: 'pg',
  connection: connectionString,
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations'
  }
};