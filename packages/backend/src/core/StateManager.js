const CONSTANTS = require('../config/constants');
const { EVENT_TYPES, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');
const db = require('./DatabaseManager');

class StateManager {
    constructor(atcService) {
        this.atcService = atcService;
        this._lastEpochBumpAt = new Map();
    }

    async initShards() {
        const shardCount = Math.max(1, Number(CONSTANTS.SHARD_COUNT || 1));
        const prefix = String(CONSTANTS.SHARD_ID_PREFIX || 'RG');
        const shards = {};

        for (let i = 0; i < shardCount; i++) {
            const shardId = `${prefix}-${i}`;
            const epoch = await this.atcService.sequencer.getEpoch(shardId);
            shards[shardId] = {
                shardId,
                epoch,
                resourceId: this.composeResourceId(shardId, epoch),
                holder: null,
                fencingToken: null,
                forcedCandidate: null,
                waitingAgents: [],
                lease: null,
                lastEscalationStep: -1,
            };
        }

        this.atcService.state.shards = shards;
        const primary = Object.keys(shards)[0];
        if (primary) this.syncLegacyStateFromShard(primary);
        this.atcService.emitState();
    }

    composeResourceId(shardId, epoch) {
        return `${CONSTANTS.LOCK_NAME}:${shardId}:e${epoch}`;
    }

    syncLegacyStateFromShard(primaryShardId) {
        const shard = this.atcService.state.shards?.[primaryShardId];
        if (!shard) return;
        this.atcService.state.resourceId = shard.resourceId;
        this.atcService.state.holder = shard.holder;
        this.atcService.state.fencingToken = shard.fencingToken;
        this.atcService.state.forcedCandidate = shard.forcedCandidate?.uuid || null;
        this.atcService.state.waitingAgents = shard.waitingAgents || [];
        this.atcService.state.timestamp = Date.now();
    }

    getShardIds() {
        return Object.keys(this.atcService.state.shards || {});
    }

    getShardIdForAgent(agentIdOrUuid) {
        const shardIds = this.getShardIds();
        if (shardIds.length === 0) return null;
        const raw = String(agentIdOrUuid || '');
        const num = Number((raw.match(/\d+/)?.[0]) || 0);
        const idx = Math.abs(num) % shardIds.length;
        return shardIds[idx];
    }

    getShardSnapshot(shardId) {
        const shard = this.atcService.state.shards?.[shardId];
        if (!shard) return null;
        return { ...shard };
    }

    async bumpEpoch(shardId, reason, forcedCandidate = null) {
        const shard = this.atcService.state.shards?.[shardId];
        if (!shard) return;
        const now = Date.now();
        const lastBumpAt = this._lastEpochBumpAt.get(shardId) || 0;
        const cooldownMs = Number(CONSTANTS.EPOCH_BUMP_COOLDOWN_MS || 0);
        if (cooldownMs > 0 && now - lastBumpAt < cooldownMs) {
            return;
        }
        this._lastEpochBumpAt.set(shardId, now);

        const globalSeq = await this.atcService.sequencer.nextGlobalSeq();
        const shardSeq = await this.atcService.sequencer.nextShardSeq(shardId);

        const epoch = await this.atcService.sequencer.bumpEpoch(shardId);
        shard.epoch = epoch;
        shard.resourceId = this.composeResourceId(shardId, epoch);
        shard.holder = null;
        shard.fencingToken = null;
        shard.lease = null;
        shard.lastEscalationStep = -1;
        shard.forcedCandidate = forcedCandidate;

        await db.appendEvent({
            globalSeq,
            shardId,
            shardSeq,
            shardEpoch: epoch,
            resourceId: shard.resourceId,
            fenceToken: null,
            action: EVENT_TYPES.SHARD_EPOCH_BUMP,
            actorUuid: 'SYSTEM',
            correlationId: `g${globalSeq}:${EVENT_TYPES.SHARD_EPOCH_BUMP}:${shardId}`,
            payload: {
                shardId,
                epoch,
                resourceId: shard.resourceId,
                reason,
                forcedCandidate
            }
        }).catch(e => {
            const logger = require('../utils/logger');
            logger.error(`[StateManager] Failed to append epoch bump event: ${e.message}`);
        });

        this.atcService.addLog('SYSTEM', `🔁 SHARD_EPOCH_BUMP ${shardId} -> e${epoch} (${reason}) [g${globalSeq}/s${shardSeq}]`, 'policy', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.TRANSFER_LOCK });

        const primary = this.getShardIds()[0];
        if (primary === shardId) this.syncLegacyStateFromShard(primary);
        this.atcService.emitState();
    }

    async monitorShards() {
        if (!this.atcService.sharedClient) return;
        const cpSubsystem = typeof this.atcService.sharedClient.getCPSubsystem === 'function'
            ? this.atcService.sharedClient.getCPSubsystem()
            : null;
        let leaderLock = null;
        let leaderFence = null;
        if (cpSubsystem) {
            try {
                leaderLock = await cpSubsystem.getLock(CONSTANTS.MONITOR_LEADER_LOCK_NAME);
                leaderFence = await leaderLock.tryLock(1);
                if (!leaderFence) return;
            } catch {
                return;
            }
        }
        const now = Date.now();
        const shardIds = this.getShardIds();
        if (shardIds.length === 0) return;

        const statusMap = await this.atcService.sharedClient.getMap(CONSTANTS.MAP_AGENT_STATUS);
        try {
            for (const shardId of shardIds) {
                const shard = this.atcService.state.shards[shardId];
                if (!shard) continue;

                if (shard.holder) {
                    const holderUuid = String(shard.holder);
                    const info = await statusMap.get(holderUuid);
                    const hbAge = info?.lastUpdated ? (now - Number(info.lastUpdated)) : Number.POSITIVE_INFINITY;
                    const actAt = this.atcService._lastActivityAt.get(holderUuid) || 0;
                    const actAge = actAt ? (now - actAt) : Number.POSITIVE_INFINITY;

                    if (hbAge > CONSTANTS.HEARTBEAT_STALE_MS || actAge > CONSTANTS.ACTIVITY_STALE_MS) {
                        await this.bumpEpoch(shardId, 'STALE_HOLDER', null);
                        continue;
                    }

                    const leaseEndsAt = shard.lease?.endsAt;
                    if (leaseEndsAt && now > leaseEndsAt) {
                        const agent = this.atcService.agents.get(holderUuid);
                        if (agent) this.atcService.treasury.applySlashing(agent, 'LEASE_EXPIRED', { shardId, shardEpoch: shard.epoch, resourceId: shard.resourceId, fenceToken: shard.fencingToken });
                        await this.bumpEpoch(shardId, 'LEASE_EXPIRED', null);
                        continue;
                    }

                    const leaseStartsAt = shard.lease?.startsAt;
                    if (leaseStartsAt) {
                        const stepMs = Number(CONSTANTS.ESCALATION_STEP_MS || 0);
                        if (stepMs > 0) {
                            const step = Math.floor((now - leaseStartsAt) / stepMs);
                            if (step > shard.lastEscalationStep) {
                                const agent = this.atcService.agents.get(holderUuid);
                                if (agent) {
                                    const fee = Number(CONSTANTS.ESCALATION_BASE_FEE || 0) * Math.pow(Number(CONSTANTS.ESCALATION_MULTIPLIER || 1), step);
                                    const ok = this.atcService.treasury.collectHoldingFee(agent, fee, `HOLD_ESCALATION_${shardId}_S${step}`, { shardId, shardEpoch: shard.epoch, resourceId: shard.resourceId, fenceToken: shard.fencingToken, step });
                                    if (!ok) {
                                        this.atcService.treasury.applySlashing(agent, 'HOLDING_FEE_UNPAID', { shardId, shardEpoch: shard.epoch, resourceId: shard.resourceId, fenceToken: shard.fencingToken });
                                        await this.bumpEpoch(shardId, 'HOLDING_FEE_UNPAID', null);
                                        continue;
                                    }
                                }
                                shard.lastEscalationStep = step;
                            }
                        }
                    }
                }

                const forced = shard.forcedCandidate;
                if (forced?.uuid) {
                    const info = await statusMap.get(String(forced.uuid));
                    const hbAge = info?.lastUpdated ? (now - Number(info.lastUpdated)) : Number.POSITIVE_INFINITY;
                    if (hbAge > CONSTANTS.HEARTBEAT_STALE_MS) {
                        shard.forcedCandidate = null;
                        this.atcService.addLog('SYSTEM', `⚠️ FORCED_CANDIDATE_STALE ${forced.uuid} on ${shardId}`, 'warn', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.TRANSFER_LOCK });
                    }
                }
            }
        } finally {
            if (leaderLock && leaderFence) {
                try { await leaderLock.unlock(leaderFence); } catch {}
            }
        }

        const primary = shardIds[0];
        if (primary) this.syncLegacyStateFromShard(primary);
    }
}
module.exports = StateManager;
