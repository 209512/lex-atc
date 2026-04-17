const Irys = require('@irys/sdk');
const logger = require('../../utils/logger');

class AuditTrailArchiver {
    constructor() {
        this.irys = null;
        this.enabled = process.env.ENABLE_IRYS_ARCHIVING === 'true';
    }

    async init() {
        if (!this.enabled || !process.env.IRYS_PRIVATE_KEY) return;
        try {
            const network = process.env.IRYS_NETWORK || 'devnet';
            const providerUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
            this.irys = new Irys({
                network,
                token: 'solana',
                key: process.env.IRYS_PRIVATE_KEY,
                config: { providerUrl }
            });
            logger.info(`[AuditTrailArchiver] Initialized Irys on ${network}`);
        } catch (e) {
            logger.error(`[AuditTrailArchiver] Failed to init Irys:`, e.message);
        }
    }

    async archiveSlashingEvent(agentId, metrics, reason, snapshot) {
        if (!this.enabled || !this.irys) return null;

        const payload = {
            timestamp: new Date().toISOString(),
            agentId,
            action: 'SLASHING_JUSTIFICATION',
            reason,
            metrics,
            snapshotContext: snapshot
        };

        try {
            const tags = [
                { name: 'Content-Type', value: 'application/json' },
                { name: 'App-Name', value: 'lex-atc' },
                { name: 'Event-Type', value: 'slashing_audit' },
                { name: 'Agent-Id', value: agentId }
            ];

            const receipt = await this.irys.upload(JSON.stringify(payload), { tags });
            logger.info(`[AuditTrailArchiver] Slashing evidence for ${agentId} permanently archived to Arweave: ${receipt.id}`);
            return receipt.id;
        } catch (e) {
            logger.error(`[AuditTrailArchiver] Failed to archive slashing event for ${agentId}:`, e.message);
            return null;
        }
    }
}

module.exports = new AuditTrailArchiver();
