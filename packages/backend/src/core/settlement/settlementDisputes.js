const req = require;
const { v4: uuidv4 } = req('uuid');
const logger = require('../../utils/logger');
const { normalizeDisputeInput, shouldRejectDispute } = require('./stateMachine');
const { markDispute, markResolvedDisputeKey } = req('./settlementReducer');

const openDispute = async (engine, { channelId, openedBy, targetNonce, reason, arweaveTxId }) => {
    const {
        normalizedChannelId,
        normalizedOpenedBy,
        normalizedTargetNonce,
        normalizedReason,
        normalizedArweaveTxId,
        idempotencyKey,
        agentUuid
    } = normalizeDisputeInput({ channelId, openedBy, targetNonce, reason, arweaveTxId });

    if (engine.state.resolvedDisputes.has(idempotencyKey)) {
        logger.warn(`🛡️ [SettlementEngine] Replay Attack Prevented: Dispute already resolved for ${idempotencyKey}`);
        throw new Error('DISPUTE_ALREADY_RESOLVED');
    }

    const existingDispute = await engine.repo.getDispute(idempotencyKey).catch(err => {
        logger.error(`[SettlementEngine] getDispute error for ${idempotencyKey}:`, err);
        return null;
    });

    const reject = shouldRejectDispute({ resolvedDisputes: engine.state.resolvedDisputes, existingDispute, idempotencyKey });
    if (reject) {
        engine.state = markResolvedDisputeKey(engine.state, idempotencyKey);
        logger.warn(`🛡️ [SettlementEngine] Replay Attack Prevented (Ledger): Dispute already resolved for ${idempotencyKey}`);
        throw new Error(reject);
    }

    let chain;
    try {
        const authorityKeypair = engine.provider.getAuthorityKeypair(agentUuid);
        chain = await engine.provider.openDispute({ channelId: normalizedChannelId, targetNonce: normalizedTargetNonce }, { authorityKeypair, commitment: 'finalized' });
    } catch (err) {
        await engine.atcService.recordEvent({
            shardId: 'RG-0',
            shardEpoch: 0,
            resourceId: null,
            fenceToken: null,
            action: 'DISPUTE_OPEN_FAILED',
            actorUuid: normalizedOpenedBy,
            correlationId: `dispute:failed:${normalizedChannelId}:${normalizedTargetNonce}`,
            payload: { channelId: normalizedChannelId, targetNonce: normalizedTargetNonce, reason: normalizedReason, error: String(err?.message || err) }
        }).catch(recordErr => logger.error('[SettlementEngine] recordEvent error on DISPUTE_OPEN_FAILED:', recordErr));
        throw err;
    }

    const disputeId = uuidv4();
    await engine.repo.insertDispute({ disputeId, channelId: normalizedChannelId, openedBy: normalizedOpenedBy, targetNonce: normalizedTargetNonce, reason: normalizedReason, status: 'OPEN', idempotencyKey, arweaveTxId: normalizedArweaveTxId });
    await engine.atcService.recordEvent({
        shardId: 'RG-0',
        shardEpoch: 0,
        resourceId: null,
        fenceToken: null,
        action: 'DISPUTE_OPENED',
        actorUuid: normalizedOpenedBy,
        correlationId: idempotencyKey,
        payload: { disputeId, channelId: normalizedChannelId, targetNonce: normalizedTargetNonce, reason: normalizedReason, txid: chain.txid, commitment: chain.commitment, status: chain.status, arweaveTxId: normalizedArweaveTxId }
    });

    engine.state = markDispute(engine.state, { channelId: normalizedChannelId, idempotencyKey });

    if (engine.atcService.state) engine.atcService.state.settlement = engine.getPublicState();
    if (typeof engine.atcService.emitState === 'function') engine.atcService.emitState();
    const chainMeta = engine._requireChainMeta('openDispute', chain, {
        actorUuid: normalizedOpenedBy,
        channelId: normalizedChannelId,
        targetNonce: normalizedTargetNonce,
        disputeId
    });
    return { ok: true, disputeId, ...chainMeta };
};

module.exports = {
    openDispute,
};
