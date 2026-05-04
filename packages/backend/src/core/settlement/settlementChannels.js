const CONSTANTS = require('../../config/constants');
const WalletEngine = require('../WalletEngine');
const logger = require('../../utils/logger');
const req = require;
const { PublicKey } = req('@solana/web3.js');
const { emitGasEconomics } = require('./settlementGas');
const { createAndMaybeSubmitSnapshot } = require('./settlementSnapshots');
const { enqueueTask, drainChannel, requeueChannel } = req('./settlementReducer');

const channelIdForAgent = (agentUuid) => `channel:${agentUuid}`;

const assertPubkey = (addr) => {
    try { new PublicKey(addr); return true; } catch { return false; }
};

const ensureChannel = async (engine, agent) => {
    const channelId = channelIdForAgent(agent.uuid);
    const treasuryAddr = engine.atcService?.treasury?.systemVault?.address || WalletEngine.getTreasuryAddress();

    const participantAgent = agent.account?.address || agent.address;
    const participantTreasury = treasuryAddr;

    if (!assertPubkey(participantAgent)) {
        throw new Error('Invalid agent public key');
    }

    await engine.repo.upsertChannel({
        channelId,
        agentUuid: agent.uuid,
        participantAgent,
        participantTreasury,
        disputeWindowMs: Number(CONSTANTS.SETTLEMENT_DISPUTE_WINDOW_MS || 0)
    });
    return channelId;
};

const onTaskExecuted = async (engine, task, execResult) => {
    if (!task) return;
    if (task.status !== 'EXECUTED') return;

    const agent = engine.atcService.agents.get(String(task.actorUuid));
    if (!agent) return;
    engine.gas.immediateTxCount += 1;

    const channelId = await ensureChannel(engine, agent);

    engine.state = enqueueTask(engine.state, channelId, { task, execResult, at: Date.now() });

    if (engine.atcService.state) engine.atcService.state.settlement = engine.getPublicState();
    if (typeof engine.atcService.emitState === 'function') engine.atcService.emitState();
    emitGasEconomics(engine, 'task');

    await engine.atcService.recordEvent({
        shardId: task.shardId,
        shardEpoch: task.shardEpoch,
        resourceId: task.resourceId,
        fenceToken: task.fenceToken,
        action: 'SETTLEMENT_TRIGGERED',
        actorUuid: task.actorUuid,
        correlationId: `settlement:trigger:${task.taskId}`,
        payload: { channelId, taskId: task.taskId, classification: task.classification }
    });
};

const flushPending = async (engine) => {
    for (const [channelId, items] of engine.state.pendingByChannel.entries()) {
        if (!items || items.length === 0) continue;

        const drained = drainChannel(engine.state, channelId);
        engine.state = drained.state;
        const toProcess = drained.drained;

        try {
            await createAndMaybeSubmitSnapshot(engine, channelId, toProcess);
        } catch (err) {
            if (!engine._isQuietTestError(err)) logger.error(`[SettlementEngine] Failed to process snapshot for channel ${channelId}:`, err);
            const code = String(err?.code || err?.message || '');
            const permanent = code === 'SOLANA_SETTLEMENT_DISABLED' || code === 'SOLANA_RPC_URL_MISSING';
            if (!permanent) {
                const toRequeue = [];
                for (const item of toProcess) {
                    item.retryCount = (item.retryCount || 0) + 1;
                    if (item.retryCount < 3) {
                        toRequeue.push(item);
                        if (!engine._isQuietTestError(err)) logger.warn(`⚠️ [SettlementEngine] Snapshot failed (Attempt ${item.retryCount}/3), requeuing for ${channelId}`);
                    } else {
                        if (!engine._isQuietTestError(err)) logger.error(`🚨 [SettlementEngine] Snapshot permanently failed after 3 attempts for ${channelId}. Moving to DLQ.`);
                    }
                }
                const current = engine.state.pendingByChannel.get(channelId) || [];
                engine.state = requeueChannel(engine.state, channelId, [...toRequeue, ...current]);
            }
        }
    }

    if (engine.atcService.state) engine.atcService.state.settlement = engine.getPublicState();
    if (typeof engine.atcService.emitState === 'function') engine.atcService.emitState();
};

module.exports = {
    channelIdForAgent,
    ensureChannel,
    onTaskExecuted,
    flushPending,
};
