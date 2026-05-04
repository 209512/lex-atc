const logger = require('../../../utils/logger');

const startBackgroundWorker = (manager) => {
    if (manager.flushInterval) clearInterval(manager.flushInterval);
    manager.flushInterval = setInterval(() => {
        manager.flushEventBuffer().catch(e => logger.error('[DatabaseManager] Event bulk insert failed:', e));
    }, 1000);
    if (manager.flushInterval.unref) {
        manager.flushInterval.unref();
    }
};

const stopBackgroundWorker = (manager) => {
    if (!manager.flushInterval) return;
    clearInterval(manager.flushInterval);
    manager.flushInterval = null;
};

module.exports = {
    startBackgroundWorker,
    stopBackgroundWorker,
};

