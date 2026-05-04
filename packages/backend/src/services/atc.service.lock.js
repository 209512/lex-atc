const CONSTANTS = require('../config/constants');
const { EVENT_TYPES, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');

const commitAgentAcquired = async (svc, { id, fence, latency, shardId, resourceId, epoch, ticket }) => {
    const uuid = String(id);
    const sid = shardId || svc.getShardIdForAgent(uuid);
    const shard = svc.state.shards?.[sid];
    if (!shard) throw new Error('SHARD_NOT_FOUND');

    const shardEpoch = epoch ?? shard.epoch;
    const rid = resourceId || shard.resourceId;
    await svc.recordEvent({
        shardId: sid,
        shardEpoch,
        resourceId: rid,
        fenceToken: fence,
        action: EVENT_TYPES.LOCK_ACQUIRED,
        actorUuid: uuid,
        payload: { latency, ticket: ticket || 0 }
    });

    if (shard.forcedCandidate?.uuid === uuid) {
        svc.lockDirector.clearTransferTimeoutForCandidate(uuid);
        svc.addLog(uuid, `✨ Success: Received Transferred Lock (${sid})`, 'success', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_ACQUIRED });
        svc.emit('transfer-success', { id: uuid, shardId: sid });
        shard.forcedCandidate = null;
    } else if (svc.state.forcedCandidate === uuid) {
        svc.lockDirector.clearTransferTimeoutForCandidate(uuid);
        svc.addLog(uuid, `✨ Success: Received Transferred Lock`, 'success', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_ACQUIRED });
        svc.emit('transfer-success', { id: uuid });
        svc.state.forcedCandidate = null;
    }

    if (svc.takeoverEscrow?.has(uuid)) {
        const escrow = svc.takeoverEscrow.get(uuid);
        const victim = svc.agents.get(escrow.victim);
        if (victim) {
            victim.account.balance += escrow.amount;
            svc.addLog('SYSTEM', `💸 Escrow paid to ${victim.id} (${escrow.amount} SOL)`, 'info', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.ECONOMY, actionKey: LOG_ACTIONS.EVICTION_SLASH });
        }
        svc.takeoverEscrow.delete(uuid);
    }

    svc.addLog(uuid, `🔒 Access Granted (Fence: ${fence})`, 'lock', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_ACQUIRED });

    shard.holder = uuid;
    shard.fencingToken = fence;
    shard.latency = latency;
    shard.lease = { startsAt: Date.now(), endsAt: Date.now() + (Number(CONSTANTS.LOCK_LEASE_MS) || 5000), durationMs: Number(CONSTANTS.LOCK_LEASE_MS) || 5000 };
    shard.waitingAgents = (shard.waitingAgents || []).filter(a => String(a) !== uuid);

    const primary = Object.keys(svc.state.shards || {})[0] || 'RG-0';
    if (primary === sid) {
        svc.state.holder = uuid;
        svc.state.fencingToken = fence;
        svc.state.latency = latency;
        svc.state.timestamp = Date.now();
        svc.state.waitingAgents = (svc.state.waitingAgents || []).filter(uid => uid !== uuid);
    }
    svc.emitState();
    return { ok: true };
};

const commitAgentReleased = async (svc, { id, shardId, resourceId, epoch }) => {
    const uuid = String(id);
    const sid = shardId || svc.getShardIdForAgent(uuid);
    const shard = svc.state.shards?.[sid];
    if (!shard) throw new Error('SHARD_NOT_FOUND');

    const shardEpoch = epoch ?? shard.epoch;
    const rid = resourceId || shard.resourceId;
    await svc.recordEvent({
        shardId: sid,
        shardEpoch,
        resourceId: rid,
        action: EVENT_TYPES.LOCK_RELEASED,
        actorUuid: uuid,
    });

    svc.addLog(uuid, `🔓 Lock Released on ${sid}`, 'info', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.LOCK_RELEASED });

    if (shard.holder === uuid) {
        shard.holder = null;
        shard.fencingToken = null;
        shard.lease = null;
    }

    const primary = Object.keys(svc.state.shards || {})[0] || 'RG-0';
    if (primary === sid && svc.state.holder === uuid) {
        svc.state.holder = null;
        svc.state.fencingToken = null;
    }

    svc.emitState();
    return { ok: true };
};

module.exports = {
    commitAgentAcquired,
    commitAgentReleased,
};
