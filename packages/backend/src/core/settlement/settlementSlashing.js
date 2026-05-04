const logger = require('../../utils/logger');
const { LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');

const slash = async (engine, { channelId, actorUuid, reason }) => {
    const normalizedChannelId = String(channelId || '');
    const normalizedActorUuid = String(actorUuid || 'ADMIN');
    const normalizedReason = String(reason || 'SLASH');
    if (!normalizedChannelId) throw new Error('INVALID_CHANNEL_ID');

    const agentUuid = normalizedChannelId.split(':')[1];
    let chain;
    try {
        const authorityKeypair = engine.provider.getAuthorityKeypair(agentUuid);
        chain = await engine.provider.slash({ channelId: normalizedChannelId, reason: normalizedReason }, { authorityKeypair, commitment: 'finalized' });
    } catch (err) {
        if (err.message === 'SOLANA_SETTLEMENT_DISABLED' || err.code === 'SOLANA_SETTLEMENT_DISABLED') {
            chain = { txid: 'mock-txid-' + Date.now(), commitment: 'mocked', status: 'MOCKED' };
            const agent = engine.atcService.agents ? engine.atcService.agents.get(agentUuid) : null;
            if (agent && engine.atcService.treasury && typeof engine.atcService.treasury.applySlashing === 'function') {
                engine.atcService.treasury.applySlashing(agent, 'ADMIN_INTERVENTION');
            }
        } else {
            await engine.atcService.recordEvent({
                shardId: 'RG-0',
                shardEpoch: 0,
                resourceId: null,
                fenceToken: null,
                action: 'SETTLEMENT_SLASH_FAILED',
                actorUuid: normalizedActorUuid,
                correlationId: `slash:failed:${normalizedChannelId}:${normalizedActorUuid}:${normalizedReason}`,
                payload: { channelId: normalizedChannelId, reason: normalizedReason, error: String(err?.message || err) }
            }).catch(recordErr => logger.error('[SettlementEngine] recordEvent error on SETTLEMENT_SLASH_FAILED:', recordErr));
            throw err;
        }
    }

    await engine.atcService.recordEvent({
        shardId: 'RG-0',
        shardEpoch: 0,
        resourceId: null,
        fenceToken: null,
        action: 'SETTLEMENT_SLASH',
        actorUuid: normalizedActorUuid,
        correlationId: `slash:${normalizedChannelId}:${normalizedActorUuid}:${normalizedReason}`,
        payload: { channelId: normalizedChannelId, reason: normalizedReason, txid: chain.txid, commitment: chain.commitment, status: chain.status }
    });

    if (typeof engine.atcService.addLog === 'function') {
        engine.atcService.addLog(agentUuid, `🚨 Slashed: ${normalizedReason}`, 'critical', { 
            stage: LOG_STAGES.EXECUTED, 
            domain: LOG_DOMAINS.ECONOMY, 
            actionKey: LOG_ACTIONS.SETTLEMENT_SLASH,
            agentId: agentUuid,
            metrics: {
                conflictRate: 100,
                balanceDrain: 100,
                anomalyScore: 1.0
            },
            arweaveTxId: chain.txid
        });
    }

    if (engine.atcService.agentManager && typeof engine.atcService.agentManager.terminateAgent === 'function') {
        logger.info(`[SettlementEngine] Forcibly terminating slashed agent: ${agentUuid}`);
        engine.atcService.agentManager.terminateAgent(agentUuid, true).catch(err => logger.error(`Terminate error: ${err}`));
    }

    const chainMeta = engine._requireChainMeta('slash', chain, {
        actorUuid: normalizedActorUuid,
        channelId: normalizedChannelId,
        reason: normalizedReason
    });
    return { ok: true, ...chainMeta };
};

module.exports = { slash };

