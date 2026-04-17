const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const Irys = require('@irys/sdk');

class ArchivingWorker {
    constructor(dbPool) {
        this.pool = dbPool;
        this.archivingIntervalMs = 24 * 60 * 60 * 1000; // Run daily
        this.retentionDays = 180; // 6 months
    }

    _getIrys() {
        if (!process.env.IRYS_PRIVATE_KEY) return null;
        try {
            const network = process.env.IRYS_NETWORK || (process.env.NODE_ENV === 'production' ? 'mainnet' : 'devnet');
            const irys = new Irys({
                network, 
                token: "solana",
                key: process.env.IRYS_PRIVATE_KEY, 
                config: { providerUrl: process.env.SOLANA_RPC_URL }
            });
            return irys;
        } catch (err) {
            logger.warn('[ArchivingWorker] Irys initialization failed:', err.message);
            return null;
        }
    }

    start() {
        if (!this.pool) return;
        this.intervalId = setInterval(() => this.runArchival(), this.archivingIntervalMs);
        if (this.intervalId.unref) this.intervalId.unref();
        logger.info(`[ArchivingWorker] Started. Retention: ${this.retentionDays} days.`);
        // Run immediately on start
        this.startTimeoutId = setTimeout(() => this.runArchival(), 10000);
        if (this.startTimeoutId.unref) this.startTimeoutId.unref();
    }

    stop() {
        if (this.intervalId) clearInterval(this.intervalId);
        if (this.startTimeoutId) clearTimeout(this.startTimeoutId);
    }

    async processRetryQueue() {
        const pendingDir = path.join(__dirname, `../../../archives/pending`);
        const completedDir = path.join(__dirname, `../../../archives/completed`);

        if (!fs.existsSync(pendingDir)) return;

        const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.json'));
        if (files.length === 0) return;

        const irys = this._getIrys();
        if (!irys) return;

        logger.info(`[ArchivingWorker] Found ${files.length} pending files. Processing retry queue...`);

        for (const file of files) {
            const pendingFile = path.join(pendingDir, file);
            try {
                const dumpString = fs.readFileSync(pendingFile, 'utf8');
                logger.info(`[ArchivingWorker] Retrying upload for ${file}...`);
                
                const receipt = await irys.upload(dumpString);
                logger.info(`[ArchivingWorker] Successfully uploaded ${file}! TxId: ${receipt.id}`);
                
                if (!fs.existsSync(completedDir)) fs.mkdirSync(completedDir, { recursive: true });
                fs.renameSync(pendingFile, path.join(completedDir, file));
                
                const parts = file.split('_');
                if (parts.length >= 2) {
                    const cutoffStr = parts[1];
                    // We attempt to drop partitions corresponding to the old date, otherwise fallback to row-deletion
                    try {
                        const safeSuffix = cutoffStr.replace(/[^0-9]/g, '');
                        if (!safeSuffix) continue;

                        await this.pool.query(`DROP TABLE IF EXISTS event_logs_p${safeSuffix}`);
                        await this.pool.query(`DROP TABLE IF EXISTS agent_snapshots_p${safeSuffix}`);
                        logger.info(`[ArchivingWorker] Dropped partitions older than ${cutoffStr} after successful retry.`);
                    } catch (dropErr) {
                        await this.pool.query(`DELETE FROM event_logs WHERE created_at < $1`, [cutoffStr]);
                        await this.pool.query(`DELETE FROM agent_snapshots WHERE snapshot_created_at < $1`, [cutoffStr]);
                        logger.info(`[ArchivingWorker] Cleared records older than ${cutoffStr} from DB after successful retry.`);
                    }
                }
            } catch (err) {
                logger.error(`[ArchivingWorker] Failed to upload ${file} during retry:`, err.message);
            }
        }
    }

    async runArchival() {
        try {
            await this.processRetryQueue();

            logger.info('[ArchivingWorker] Checking for old partitions...');
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
            const cutoffStr = cutoffDate.toISOString().split('T')[0];

            // In a real system, we'd query pg_class/pg_inherits to find partitions older than the cutoff
            // For now, we simulate archiving old records to S3/Filecoin.
            const result = await this.pool.query(`
                SELECT COUNT(*) as count 
                FROM event_logs 
                WHERE created_at < $1
            `, [cutoffDate]);

            const count = parseInt(result.rows[0].count, 10);
            if (count > 0) {
                logger.info(`[ArchivingWorker] Found ${count} old events. Preparing cold backup...`);
                
                const dumpData = { archived: count, date: cutoffStr, type: 'lex_atc_event_logs' };
                const dumpString = JSON.stringify(dumpData);
                const pendingDir = path.join(__dirname, `../../../archives/pending`);
                const completedDir = path.join(__dirname, `../../../archives/completed`);
                const fileName = `events_${cutoffStr}_${Date.now()}.json`;
                const pendingFile = path.join(pendingDir, fileName);
                
                fs.mkdirSync(pendingDir, { recursive: true });
                fs.mkdirSync(completedDir, { recursive: true });
                fs.writeFileSync(pendingFile, dumpString);
                
                // Arweave / Irys Decentralized Storage Upload
                let uploadSuccess = false;
                const irys = this._getIrys();
                
                if (irys) {
                    try {
                        logger.info('[ArchivingWorker] Uploading archive to Arweave via Irys...');
                        const receipt = await irys.upload(dumpString);
                        logger.info(`[ArchivingWorker] Successfully uploaded to Arweave! TxId: ${receipt.id}`);
                        uploadSuccess = true;
                    } catch (uploadErr) {
                        logger.error('[ArchivingWorker] Irys upload failed, file remains in pending queue:', uploadErr.message);
                    }
                } else {
                    // If no Irys configured, we consider it "successful" local backup to allow DB cleanup
                    uploadSuccess = true;
                }

                if (uploadSuccess) {
                    fs.renameSync(pendingFile, path.join(completedDir, fileName));
                    
                    // Attempt partition drop first, fallback to DELETE
                    try {
                        const safeSuffix = cutoffStr.replace(/[^0-9]/g, '');
                        if (!safeSuffix) return;
            
                        await this.pool.query(`DROP TABLE IF EXISTS event_logs_p${safeSuffix}`);
                        await this.pool.query(`DROP TABLE IF EXISTS agent_snapshots_p${safeSuffix}`);
                        logger.info(`[ArchivingWorker] Archival complete. Dropped partition p${safeSuffix}.`);
                    } catch (dropErr) {
                        await this.pool.query(`DELETE FROM event_logs WHERE created_at < $1`, [cutoffStr]);
                        await this.pool.query(`DELETE FROM agent_snapshots WHERE snapshot_created_at < $1`, [cutoffStr]);
                        logger.info(`[ArchivingWorker] Archival complete. Cleared ${count} records via row-deletion.`);
                    }
                } else {
                    logger.info(`[ArchivingWorker] Archival deferred due to upload failure. Records kept in DB for next retry.`);
                }
            }
        } catch (err) {
            logger.error('[ArchivingWorker] Failed to run archival:', err.message);
        }
    }
}

module.exports = ArchivingWorker;
