const logger = require('../../utils/logger');
const CONSTANTS = require('../../config/constants');
const { LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');

const getTransferContext = (director, targetId) => {
    const shardId = director.atcService.getShardIdForAgent ? director.atcService.getShardIdForAgent(targetId) : null;
    if (!shardId) return { ok: false, error: 'No shard available' };
    const shard = director.atcService.state.shards?.[shardId];
    if (!shard) return { ok: false, error: 'Shard not found' };
    const targetAgent = director.atcService.agents.get(targetId);
    const targetLabel = targetAgent?.id || decodeURIComponent(targetId);
    return { ok: true, shardId, shard, targetAgent, targetLabel };
};

const applyTransferState = async ({ director, shardId, shard, targetId }) => {
    const oldHolder = shard.holder;
    const oldLease = shard.lease;
    const oldEpoch = shard.epoch;

    director.atcService.state.overrideSignal = false;
    director.atcService.state.holder = null;

    const nextEpoch = await director.atcService.sequencer.bumpEpoch(shardId);
    const forcedCandidate = { uuid: targetId, epoch: nextEpoch, initiatedAt: Date.now() };
    shard.epoch = nextEpoch;
    shard.resourceId = director.atcService._composeResourceId(shardId, nextEpoch);
    shard.holder = null;
    shard.fencingToken = null;
    shard.lease = null;
    shard.lastEscalationStep = -1;
    shard.forcedCandidate = forcedCandidate;

    return { oldHolder, oldLease, oldEpoch, nextEpoch };
};

const scheduleTransferTimeout = ({ director, shardId, targetId, targetLabel, isTakeover, primary, oldHolder, oldLease, oldEpoch, nextEpoch }) => {
    const timeoutRef = setTimeout(() => {
        const s = director.atcService.state.shards?.[shardId];
        if (s?.forcedCandidate?.uuid === targetId) {
            logger.warn(`⚠️ [Director] TRANSFER TIMEOUT - ${targetLabel} failed to grab the lock on ${shardId}.`);
            director.atcService.addLog('SYSTEM', `⚠️ Lock transfer timed out for ${targetLabel} on ${shardId}`, 'warn', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.TRANSFER_LOCK });
            
            const attackerUuid = targetId;
            if (isTakeover && director.atcService.takeoverEscrow?.has(attackerUuid)) {
                const escrow = director.atcService.takeoverEscrow.get(attackerUuid);
                const attacker = director.atcService.agents.get(escrow.attacker);
                if (attacker) {
                    attacker.account.balance = director.atcService.treasury._math(attacker.account.balance + escrow.amount);
                    director.atcService.addLog('SYSTEM', `Hostile Takeover timeout. Escrow ${escrow.amount} SOL refunded to ${attacker.displayName}`, 'info', { domain: LOG_DOMAINS.SYSTEM });
                } else {
                    director.atcService.treasury.systemVault.totalFeesCollected = director.atcService.treasury._math(director.atcService.treasury.systemVault.totalFeesCollected + escrow.amount);
                    director.atcService.addLog('SYSTEM', `Hostile Takeover timeout. Attacker ${escrow.attacker} offline. Escrow ${escrow.amount} SOL routed to System Vault.`, 'warn', { domain: LOG_DOMAINS.SYSTEM });
                }
                director.atcService.takeoverEscrow.delete(attackerUuid);
            }

            if (oldHolder && director.atcService.agents.has(oldHolder)) {
                s.holder = oldHolder;
                s.lease = oldLease;
                s.epoch = oldEpoch;
            } else {
                s.holder = null;
                s.lease = null;
                s.epoch = nextEpoch;
            }
            
            s.forcedCandidate = null;
            if (primary === shardId) director.atcService._syncLegacyStateFromShard(primary);
            director.atcService.emitState();
        }
        director.transferTimeoutRefs.delete(String(shardId));
    }, CONSTANTS.TRANSFER_TIMEOUT);
    director.transferTimeoutRefs.set(String(shardId), timeoutRef);
};

module.exports = async function transferLock(director, targetId, isTakeover = false) {
    const ctx = getTransferContext(director, targetId);
    if (!ctx.ok) return { success: false, error: ctx.error };
    const { shardId, shard, targetLabel } = ctx;

    if (shard.forcedCandidate?.uuid) {
        logger.warn(`⚠️ [Director] Transfer already in progress on ${shardId} for ${shard.forcedCandidate.uuid}.`);
        return { success: false, error: 'Transfer in progress' };
    }

    const isPaused = await director.atcService.isAgentPaused(targetId);
    if (isPaused) return { success: false, error: 'Target agent is paused' };

    director._clearTransferTimeout(shardId);

    if (process.env.NODE_ENV !== 'test') logger.info(`⚡ [Director] Initiating Fast-Transfer to ${targetLabel} on ${shardId}...`);
    director.atcService.addLog('SYSTEM', `⚡ Lock transfer started to ${targetLabel} on ${shardId}`, 'policy', { stage: LOG_STAGES.ACCEPTED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.TRANSFER_LOCK });

    const { oldHolder, oldLease, oldEpoch, nextEpoch } = await applyTransferState({ director, shardId, shard, targetId });

    const primary = director.atcService.getShardIds()[0];
    if (primary === shardId) director.atcService._syncLegacyStateFromShard(primary);

    director.atcService.emitState();

    scheduleTransferTimeout({ director, shardId, targetId, targetLabel, isTakeover, primary, oldHolder, oldLease, oldEpoch, nextEpoch });

    return { success: true, shardId, epoch: nextEpoch, oldHolder, oldLease, oldEpoch };
}
