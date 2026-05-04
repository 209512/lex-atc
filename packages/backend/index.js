// backend/index.js
require('./src/utils/apm.js');

const { loadBackendConfig } = require('./src/config/env');
const atcService = require('./src/services/atc.service');
const logger = require('./src/utils/logger');
const { buildApp } = require('./src/server/buildApp');
const { start: startServer } = require('./src/server/start');
const { shutdown } = require('./src/server/shutdown');

let globalServer = null;

process.on('SIGINT', () => shutdown('SIGINT', globalServer, atcService));
process.on('SIGTERM', () => shutdown('SIGTERM', globalServer, atcService));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown('unhandledRejection', globalServer, atcService);
});

process.on('uncaughtException', (error) => {
  logger.error('[Process] Uncaught Exception:', error);
  shutdown('uncaughtException', globalServer, atcService);
});

const PORT = process.env.PORT || 3000;

// DO NOT create an app instance in global scope to prevent side effects in tests.
// The real startup logic is encapsulated in the `start` function.

const start = async ({ port = PORT, initialAgents = 2 } = {}) => {
  globalServer = await startServer({ atcService, port, initialAgents });
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
