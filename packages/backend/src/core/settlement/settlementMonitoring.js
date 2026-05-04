const req = require;
const axios = req('axios');
const { LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = req('@lex-atc/shared');
const logger = require('../../utils/logger');
const AuditTrailArchiver = require('./AuditTrailArchiver');

module.exports = async function runAutoMonitoring(engine) {
    for (const [channelId, snap] of engine.state.lastSnapshotByChannel.entries()) {
        if (engine.state.disputedByChannel.get(channelId)) continue;

        const agentUuid = channelId.split(':')[1];
        const agent = engine.atcService.agents.get(agentUuid);

        if (!agent) continue;

        const isErrorState = agent.status === 'ERROR';
        const hasHighCollisions = (agent.metrics?.collisions || 0) > 20;

        let isMlAnomaly = false;
        let mlReason = '';
        const mlApiUrl = engine.atcService.config?.ai?.mlInferenceApiUrl || process.env.ML_INFERENCE_API_URL;

        if (mlApiUrl) {
            try {
                const payload = {
                    agentId: agentUuid,
                    metrics: {
                        collisions: agent.metrics?.collisions || 0,
                        balance: agent.account?.balance || 0,
                        initialBalance: agent.account?.initialBalance || 1000,
                        activeProposals: Array.from(engine.atcService.governanceEngine?.proposals?.values() || [])
                            .filter(p => p.adminId === agentUuid && p.status === 'ACTIVE').length
                    }
                };
                const response = await axios.post(mlApiUrl, payload, { timeout: 2000 });
                if (response.data && response.data.anomalyScore !== undefined) {
                    if (!agent.metrics) agent.metrics = {};
                    agent.metrics.anomalyScore = response.data.anomalyScore;

                    if (response.data.anomalyScore > 0.8) {
                        isMlAnomaly = true;
                        mlReason = response.data.reason || 'AUTO_DETECTED_ML_ANOMALY';
                    }
                }
            } catch (err) {
                if (process.env.NODE_ENV !== 'test') {
                    logger.warn(`[AI-WATCHER] ML Inference API failed for ${agentUuid}:`, err.message);
                }
            }
        }

        const referenceBalance = agent.account?.lastSnapshotBalance || agent.account?.initialBalance || 1000;
        const currentBalance = agent.account?.balance || 0;
        const isRapidDrain = (referenceBalance - currentBalance) > (referenceBalance * 0.50);

        const recentProposals = Array.from(engine.atcService.governanceEngine?.proposals?.values() || [])
            .filter(p => p.adminId === agentUuid && p.status === 'ACTIVE').length;
        const hasUnusualGovernanceActivity = recentProposals > 5;

        if (!(isErrorState || hasHighCollisions || isRapidDrain || hasUnusualGovernanceActivity || isMlAnomaly)) continue;

        let reason = 'AUTO_DETECTED_ANOMALY';
        if (isMlAnomaly) reason = mlReason;
        else if (isErrorState) reason = 'AUTO_DETECTED_ERROR_STATE';
        else if (hasHighCollisions) reason = 'AUTO_DETECTED_SPAM_BEHAVIOR';
        else if (isRapidDrain) reason = 'AUTO_DETECTED_RAPID_DRAIN';
        else if (hasUnusualGovernanceActivity) reason = 'AUTO_DETECTED_GOVERNANCE_SPAM';

        if (engine.atcService.addLog) {
            engine.atcService.addLog('SYSTEM', `[AI-WATCHER] Anomaly detected for ${agent.id || agentUuid} (${reason}). Opening dispute automatically.`, 'warn', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.SETTLEMENT, actionKey: LOG_ACTIONS.SETTLEMENT_DISPUTE });
        }

        try {
            const metrics = {
                latency: 0,
                conflictRate: (agent.metrics?.collisions || 0) / 100,
                balanceDrain: (agent.account?.balance || 0) < 5000 ? ((10000 - (agent.account?.balance || 0)) / 10000) * 100 : 0,
                anomalyScore: agent.metrics?.anomalyScore || 0.9
            };

            const arweaveTxId = await AuditTrailArchiver.archiveSlashingEvent(
                agentUuid,
                metrics,
                reason,
                snap
            );

            await engine.openDispute({ 
                channelId, 
                openedBy: 'AI-WATCHER', 
                targetNonce: snap.nonce, 
                reason,
                arweaveTxId
            });
        } catch (disputeErr) {
            if (!engine._isQuietTestError(disputeErr)) logger.error(`[AI-WATCHER] Failed to open dispute for ${channelId}:`, disputeErr.message);
        }
    }
};
