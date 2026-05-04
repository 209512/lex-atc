const logger = require('../utils/logger');
const db = require('../core/DatabaseManager');

const shutdown = async (signal, globalServer, atcService) => {
    logger.info(`\n[Process] Received ${signal}. Starting graceful shutdown...`);
    if (!globalServer) {
        process.exit(0);
        return;
    }

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

            try {
                const JobQueue = require('../core/queue/JobQueue');
                await JobQueue.closeAll();
            } catch (e) { logger.error('JobQueue shutdown error:', e.message); }

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
};

module.exports = { shutdown };

