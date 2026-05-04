const logger = require('../../utils/logger');
const audit = require('./governanceAudit');

const updateReady = async (engine, p) => {
    const enough = p.approvals.size >= p.threshold;
    if (enough && p.status === 'PENDING') {
        p.status = 'READY';
        audit(engine, 'GOV_READY', 'SYSTEM', { proposalId: p.id, executeAfter: p.executeAfter, approvals: p.approvals.size, threshold: p.threshold }).catch(err => logger.error('[GovernanceEngine] Audit failed:', err));
    }
};

const cleanupMemory = (engine) => {
    const now = Date.now();
    const config = engine.atcService.config?.governance || {};
    const TTL_MS = config.gcTtlMs || 24 * 60 * 60 * 1000;
    const MAX_ITEMS = config.gcMaxItems || 5000;

    for (const [proposalId, p] of engine.proposals.entries()) {
        if (['EXECUTED', 'CANCELLED', 'FAILED'].includes(p.status)) {
            const terminalTime = p.executedAt || p.cancelledAt || p.createdAt;
            if (now - terminalTime > TTL_MS) {
                engine.proposals.delete(proposalId);
            }
        }
    }

    if (engine.proposals.size > MAX_ITEMS) {
        const sortedKeys = Array.from(engine.proposals.entries())
            .sort((a, b) => a[1].createdAt - b[1].createdAt)
            .map(entry => entry[0]);
        const excess = engine.proposals.size - MAX_ITEMS;
        for (let i = 0; i < excess; i++) {
            engine.proposals.delete(sortedKeys[i]);
        }
    }
};

const poll = async (engine) => {
    if (engine.isPolling) return;
    engine.isPolling = true;
    try {
        for (const p of engine.proposals.values()) {
            if (p.status === 'PENDING') {
                await updateReady(engine, p);
            }
        }
        cleanupMemory(engine);
    } catch (e) {
        logger.error('[GovernanceEngine] Polling Error:', e.message);
    } finally {
        engine.isPolling = false;
    }
};

module.exports = {
    poll,
    cleanupMemory,
    updateReady,
};
