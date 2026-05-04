const req = require;
const { v4: uuidv4 } = req('uuid');
const CONSTANTS = require('../../config/constants');
const WalletEngine = require('../WalletEngine');
const { canonicalStringify } = require('./CanonicalJson');
const { sign, verify, hashHex } = require('./SignatureEngine');
const logger = require('../../utils/logger');
const { toLamports, enforceDepositBounds } = require('./settlementGas');
const { recordSnapshot } = req('./settlementReducer');

const createAndMaybeSubmitSnapshot = async (engine, channelId, items) => {
    const channel = await engine.repo.getChannel(channelId);
    if (!channel) return;

    const agentUuid = channel.agent_uuid;
    const agent = engine.atcService.agents.get(String(agentUuid));
    if (!agent) return;

    const nonce = Number(channel.last_nonce ?? -1) + 1;
    const balances = {
        agentLamports: toLamports(agent.account?.balance ?? 0),
        agentEscrowLamports: toLamports(agent.account?.escrow ?? 0),
        treasuryFeesLamports: toLamports(engine.atcService?.treasury?.systemVault?.totalFeesCollected ?? 0),
    };

    const task = items[items.length - 1]?.task;
    const shardId = task?.shardId || engine.atcService.getShardIdForAgent(agentUuid) || 'RG-0';
    const shardEpoch = task?.shardEpoch ?? engine.atcService.state?.shards?.[shardId]?.epoch ?? 0;
    const resourceId = task?.resourceId || engine.atcService.state?.shards?.[shardId]?.resourceId || null;

    const state = {
        channelId,
        participants: {
            agent: channel.participant_agent,
            treasury: channel.participant_treasury,
        },
        nonce,
        balances,
        disputeWindowMs: Number(channel.dispute_window_ms || CONSTANTS.SETTLEMENT_DISPUTE_WINDOW_MS || 0),
        validUntil: Date.now() + Number(CONSTANTS.SETTLEMENT_STALE_MS || 0),
        taskId: task?.taskId || null,
    };
    const message = canonicalStringify(state);
    const stateHash = hashHex(message);
    const commitmentBytes = Buffer.from(stateHash, 'hex');

    const agentKp = WalletEngine.getAgentKeypair(agentUuid);
    const treasuryKp = WalletEngine.getTreasuryKeypair();
    if (!agentKp || !treasuryKp) {
        throw new Error('SETTLEMENT_KEYS_MISSING');
    }

    const sigAgent = sign(commitmentBytes, agentKp.secretKey);
    const sigTreasury = sign(commitmentBytes, treasuryKp.secretKey);

    const okAgent = verify(commitmentBytes, sigAgent, agentKp.publicKey.toBytes());
    const okTreasury = verify(commitmentBytes, sigTreasury, treasuryKp.publicKey.toBytes());
    if (!okAgent || !okTreasury) throw new Error('Signature verification failed');

    const snapshot = {
        id: uuidv4(),
        channelId,
        nonce,
        balances,
        stateHash,
        signatures: {
            agent: sigAgent,
            treasury: sigTreasury,
        },
        disputeWindowMs: state.disputeWindowMs,
        validUntil: new Date(state.validUntil).toISOString(),
        status: 'SIGNED',
        taskId: state.taskId,
        globalSeq: await engine.atcService.sequencer.nextGlobalSeq(),
        shardId,
        shardEpoch,
        resourceId,
    };

    await engine.repo.insertChannelSnapshot(snapshot);
    engine.gas.snapshotTxCount += 1;

    engine.state = recordSnapshot(engine.state, { channelId, nonce, stateHash, status: snapshot.status });

    await engine.atcService.recordEvent({
        shardId,
        shardEpoch,
        resourceId,
        fenceToken: task?.fenceToken || null,
        action: 'SETTLEMENT_SNAPSHOT_CREATED',
        actorUuid: agentUuid,
        correlationId: `settlement:snapshot:${channelId}:${nonce}`,
        payload: { channelId, nonce, stateHash, validUntil: snapshot.validUntil }
    });

    await submitSnapshot(engine, snapshot, agentUuid);
};

const ensureFinalizedForAgent = async (engine, agentUuid, { shardId = null, shardEpoch = null, resourceId = null, fenceToken = null, taskId = null } = {}) => {
    const agent = engine.atcService.agents.get(String(agentUuid));
    if (!agent) throw new Error('AGENT_NOT_FOUND');

    const channelId = await engine.ensureChannel(agent);
    const channel = await engine.repo.getChannel(channelId);
    if (!channel) throw new Error('CHANNEL_NOT_FOUND');

    const lastNonce = Number(channel.last_nonce ?? -1);
    if (lastNonce >= 0) {
        const last = await engine.repo.getChannelSnapshot(channelId, lastNonce).catch(err => {
            logger.error(`[SettlementEngine] getChannelSnapshot error for ${channelId}:`, err);
            return null;
        });
        if (last && String(last.onchain_status || '') === 'FINALIZED') {
            return { ok: true, channelId, nonce: lastNonce, txid: last.onchain_txid || null };
        }
    }

    const nonce = lastNonce + 1;
    const balances = {
        agentLamports: toLamports(agent.account?.balance ?? 0),
        agentEscrowLamports: toLamports(agent.account?.escrow ?? 0),
        treasuryFeesLamports: toLamports(engine.atcService?.treasury?.systemVault?.totalFeesCollected ?? 0),
    };

    const resolvedShardId = shardId || engine.atcService.getShardIdForAgent(agentUuid) || 'RG-0';
    const resolvedShardEpoch = shardEpoch ?? engine.atcService.state?.shards?.[resolvedShardId]?.epoch ?? 0;
    const resolvedResourceId = resourceId || engine.atcService.state?.shards?.[resolvedShardId]?.resourceId || null;

    const state = {
        channelId,
        participants: {
            agent: channel.participant_agent,
            treasury: channel.participant_treasury,
        },
        nonce,
        balances,
        disputeWindowMs: Number(channel.dispute_window_ms || CONSTANTS.SETTLEMENT_DISPUTE_WINDOW_MS || 0),
        validUntil: Date.now() + Number(CONSTANTS.SETTLEMENT_STALE_MS || 0),
        taskId: taskId ? String(taskId) : null,
    };
    const message = canonicalStringify(state);
    const stateHash = hashHex(message);
    const commitmentBytes = Buffer.from(stateHash, 'hex');

    const agentKp = WalletEngine.getAgentKeypair(agentUuid);
    const treasuryKp = WalletEngine.getTreasuryKeypair();
    if (!agentKp || !treasuryKp) throw new Error('SETTLEMENT_KEYS_MISSING');

    const sigAgent = sign(commitmentBytes, agentKp.secretKey);
    const sigTreasury = sign(commitmentBytes, treasuryKp.secretKey);
    const okAgent = verify(commitmentBytes, sigAgent, agentKp.publicKey.toBytes());
    const okTreasury = verify(commitmentBytes, sigTreasury, treasuryKp.publicKey.toBytes());
    if (!okAgent || !okTreasury) throw new Error('Signature verification failed');

    const snapshot = {
        id: uuidv4(),
        channelId,
        nonce,
        balances,
        stateHash,
        signatures: { agent: sigAgent, treasury: sigTreasury },
        disputeWindowMs: state.disputeWindowMs,
        validUntil: new Date(state.validUntil).toISOString(),
        status: 'SIGNED',
        taskId: state.taskId,
        globalSeq: await engine.atcService.sequencer.nextGlobalSeq(),
        shardId: resolvedShardId,
        shardEpoch: resolvedShardEpoch,
        resourceId: resolvedResourceId,
    };

    await enforceDepositBounds(engine, agent, {
        shardId: resolvedShardId,
        shardEpoch: resolvedShardEpoch,
        resourceId: resolvedResourceId,
        fenceToken,
        taskId: snapshot.taskId,
        channelId,
        nonce
    });

    await engine.repo.insertChannelSnapshot(snapshot);
    engine.gas.snapshotTxCount += 1;

    await engine.atcService.recordEvent({
        shardId: resolvedShardId,
        shardEpoch: resolvedShardEpoch,
        resourceId: resolvedResourceId,
        fenceToken,
        action: 'SETTLEMENT_GATE_SNAPSHOT_CREATED',
        actorUuid: String(agentUuid),
        correlationId: `settlement:gate:${channelId}:${nonce}`,
        payload: { channelId, nonce, stateHash, validUntil: snapshot.validUntil, taskId: snapshot.taskId }
    });

    const submitted = await submitSnapshot(engine, snapshot, agentUuid, { commitment: 'finalized' });
    if (!submitted.ok) throw new Error(submitted.error || 'SETTLEMENT_GATE_SUBMIT_FAILED');
    return { ok: true, channelId, nonce, txid: submitted.txid || null };
};

const submitSnapshot = async (engine, snapshot, actorUuid, { commitment } = /** @type {any} */ ({})) => {
    const validUntil = new Date(snapshot.validUntil).getTime();
    if (Date.now() > validUntil) {
        await engine.atcService.recordEvent({
            shardId: snapshot.shardId,
            shardEpoch: snapshot.shardEpoch,
            resourceId: snapshot.resourceId,
            fenceToken: null,
            action: 'SETTLEMENT_REJECTED_STALE',
            actorUuid,
            correlationId: `settlement:stale:${snapshot.channelId}:${snapshot.nonce}`,
            payload: { channelId: snapshot.channelId, nonce: snapshot.nonce }
        });
        return { ok: false, error: 'STALE' };
    }

    let res;
    try {
        const authorityKeypair = engine.provider.getAuthorityKeypair(actorUuid);
        res = await engine.provider.submitSnapshot(snapshot, { authorityKeypair, commitment });
    } catch (err) {
        await engine.atcService.recordEvent({
            shardId: snapshot.shardId,
            shardEpoch: snapshot.shardEpoch,
            resourceId: snapshot.resourceId,
            fenceToken: null,
            action: 'SETTLEMENT_SUBMIT_FAILED',
            actorUuid,
            correlationId: `settlement:submit-failed:${snapshot.channelId}:${snapshot.nonce}`,
            payload: { channelId: snapshot.channelId, nonce: snapshot.nonce, error: String(err?.message || err) }
        }).catch(recordErr => logger.error('[SettlementEngine] recordEvent error on SETTLEMENT_SUBMIT_FAILED:', recordErr));
        throw err;
    }

    await engine.repo.updateSnapshotOnchainStatus({
        channelId: snapshot.channelId,
        nonce: snapshot.nonce,
        txid: res.txid,
        status: res.status,
        commitment: res.commitment
    }).catch(err => logger.error('[SettlementEngine] updateSnapshotOnchainStatus error:', err));

    if (engine.atcService) {
        const agentId = snapshot.channelId.split(':')[1];
        const agent = engine.atcService.agents.get(agentId);
        if (agent && agent.account) {
            agent.account.lastSnapshotBalance = agent.account.balance;
        }
    }

    engine.state = recordSnapshot(engine.state, {
        channelId: snapshot.channelId,
        nonce: snapshot.nonce,
        stateHash: snapshot.stateHash,
        status: String(res.status || 'SUBMITTED'),
        txid: res.txid || null,
        commitment: res.commitment || null,
    });
    await engine.atcService.recordEvent({
        shardId: snapshot.shardId,
        shardEpoch: snapshot.shardEpoch,
        resourceId: snapshot.resourceId,
        fenceToken: null,
        action: 'SETTLEMENT_SUBMITTED',
        actorUuid,
        correlationId: `settlement:submit:${snapshot.channelId}:${snapshot.nonce}`,
        payload: { channelId: snapshot.channelId, nonce: snapshot.nonce, txid: res.txid, commitment: res.commitment, status: res.status }
    });

    if (engine.atcService.state) engine.atcService.state.settlement = engine.getPublicState();
    if (typeof engine.atcService.emitState === 'function') engine.atcService.emitState();
    return res;
};

module.exports = {
    createAndMaybeSubmitSnapshot,
    ensureFinalizedForAgent,
    submitSnapshot,
};
