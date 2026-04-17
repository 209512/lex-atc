// backend/src/core/LockDirector.js
const hazelcastManager = require('./HazelcastManager');
const CONSTANTS = require('../config/constants');
const { LEX_CONSTITUTION } = require('@lex-atc/shared');
const { SYSTEM, LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');
const logger = require('../utils/logger');

class LockDirector {
    constructor(atcService) {
        this.atcService = atcService;
        this.transferTimeoutRefs = new Map();
    }

    refreshResourceId() {
        const shardIds = this.atcService.getShardIds ? this.atcService.getShardIds() : [];
        const primary = shardIds[0];
        if (primary) {
            const shard = this.atcService.state.shards?.[primary];
            const rid = shard?.resourceId || `${CONSTANTS.LOCK_NAME}-${Date.now()}`;
            this.atcService.state.resourceId = rid;
            logger.info(`🔄 [Director] Resource ID Refreshed: ${rid}`);
        } else {
            this.atcService.state.resourceId = `${CONSTANTS.LOCK_NAME}-${Date.now()}`;
            logger.info(`🔄 [Director] Resource ID Refreshed: ${this.atcService.state.resourceId}`);
        }
    }

    /**
     * Verifies if the given fencing token matches the current state of the shard.
     * This acts as a double-check middleware to prevent split-brain and zombie lock issues.
     */
    verifyFencingToken(shardId, token) {
        if (!shardId || !token) return false;
        
        // During Global Stop or Emergency Takeover, all existing tokens are invalid
        if (this.atcService.state.globalStop || this.atcService.state.overrideSignal) {
            return false;
        }

        const shard = this.atcService.state.shards?.[shardId];
        if (!shard) return false;
        
        return String(shard.fencingToken) === String(token);
    }

    stop() {
        for (const ref of this.transferTimeoutRefs.values()) clearTimeout(ref);
        this.transferTimeoutRefs.clear();
    }

    clearTransferTimeoutForCandidate(uuid) {
        const targetId = String(uuid);
        for (const shardId of this.atcService.getShardIds ? this.atcService.getShardIds() : []) {
            const shard = this.atcService.state.shards?.[shardId];
            if (String(shard?.forcedCandidate?.uuid || '') === targetId) {
                this._clearTransferTimeout(shardId);
            }
        }
    }

    _clearTransferTimeout(shardId) {
        const sid = String(shardId);
        const ref = this.transferTimeoutRefs.get(sid);
        if (ref) clearTimeout(ref);
        this.transferTimeoutRefs.delete(sid);
    }

    async humanOverride() {
        const currentHolderUuid = this.atcService.state.holder;
        this.atcService.addLog('ADMIN', '🚨 Emergency override engaged', 'critical', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.SYSTEM, actionKey: LOG_ACTIONS.OVERRIDE });
        
        if (currentHolderUuid && currentHolderUuid !== SYSTEM.ADMIN_HOLDER_ID) {
            const agent = this.atcService.agents.get(currentHolderUuid);
            if (agent) {
                const sid = this.atcService.getShardIdForAgent ? this.atcService.getShardIdForAgent(agent.uuid) : null;
                const shard = sid ? this.atcService.state.shards?.[sid] : null;
                if (this.atcService.treasury && typeof this.atcService.treasury.applySlashing === 'function') {
                    this.atcService.treasury.applySlashing(agent, 'ADMIN_INTERVENTION', {
                        shardId: sid,
                        shardEpoch: shard?.epoch,
                        resourceId: shard?.resourceId,
                        fenceToken: shard?.fencingToken
                    });
                }
                this.atcService.addLog('ADMIN', `🔨 Slashed ${agent.id} for slow response during override`, 'critical', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.ECONOMY, actionKey: LOG_ACTIONS.OVERRIDE_SLASH });
            }
        }

        const shardIds = this.atcService.getShardIds ? this.atcService.getShardIds() : [];
        for (const sid of shardIds) {
            await this.atcService._bumpEpoch(sid, 'ADMIN_OVERRIDE', null);
        }
        this.atcService.state.overrideSignal = true;
        this.atcService.state.forcedCandidate = null; 
        this.atcService.state.holder = SYSTEM.ADMIN_HOLDER_ID;
        
        this.atcService.emitState();
        return { success: true };
    }

    async releaseHumanLock() {
        logger.info('🔓 [Admin] Releasing Control...');
        this.atcService.addLog('ADMIN', '✅ Manual override released', 'system', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.SYSTEM, actionKey: LOG_ACTIONS.RELEASE });
        this.atcService.state.overrideSignal = false;
        this.atcService.state.holder = null;
        this.atcService.state.fencingToken = null;
        this.atcService.state.forcedCandidate = null;
        const shardIds = this.atcService.getShardIds ? this.atcService.getShardIds() : [];
        for (const sid of shardIds) {
            const shard = this.atcService.state.shards?.[sid];
            if (shard) shard.forcedCandidate = null;
        }
        this.refreshResourceId();
        this.atcService.emitState();
        return { success: true };
    }

    async transferLock(targetId, isTakeover = false) {
        const shardId = this.atcService.getShardIdForAgent ? this.atcService.getShardIdForAgent(targetId) : null;
        const targetAgent = this.atcService.agents.get(targetId);
        const targetLabel = targetAgent?.id || decodeURIComponent(targetId);
        if (!shardId) return { success: false, error: 'No shard available' };

        const shard = this.atcService.state.shards?.[shardId];
        if (!shard) return { success: false, error: 'Shard not found' };

        if (shard.forcedCandidate?.uuid) {
            logger.warn(`⚠️ [Director] Transfer already in progress on ${shardId} for ${shard.forcedCandidate.uuid}.`);
            return { success: false, error: 'Transfer in progress' };
        }

        const isPaused = await this.atcService.isAgentPaused(targetId);
        if (isPaused) return { success: false, error: 'Target agent is paused' };

        this._clearTransferTimeout(shardId);

        if (process.env.NODE_ENV !== 'test') logger.info(`⚡ [Director] Initiating Fast-Transfer to ${targetLabel} on ${shardId}...`);
        this.atcService.addLog('SYSTEM', `⚡ Lock transfer started to ${targetLabel} on ${shardId}`, 'policy', { stage: LOG_STAGES.ACCEPTED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.TRANSFER_LOCK });

        // Backup old state for rollback (Deadlock prevention)
        const oldHolder = shard.holder;
        const oldLease = shard.lease;
        const oldEpoch = shard.epoch;

        this.atcService.state.overrideSignal = false;
        this.atcService.state.holder = null;

        const nextEpoch = await this.atcService.sequencer.bumpEpoch(shardId);
        const forcedCandidate = { uuid: targetId, epoch: nextEpoch, initiatedAt: Date.now() };
        shard.epoch = nextEpoch;
        shard.resourceId = this.atcService._composeResourceId(shardId, nextEpoch);
        shard.holder = null;
        shard.fencingToken = null;
        shard.lease = null;
        shard.lastEscalationStep = -1;
        shard.forcedCandidate = forcedCandidate;

        const primary = this.atcService.getShardIds()[0];
        if (primary === shardId) this.atcService._syncLegacyStateFromShard(primary);

        this.atcService.emitState();

        const timeoutRef = setTimeout(() => {
            const s = this.atcService.state.shards?.[shardId];
            if (s?.forcedCandidate?.uuid === targetId) {
                logger.warn(`⚠️ [Director] TRANSFER TIMEOUT - ${targetLabel} failed to grab the lock on ${shardId}.`);
                this.atcService.addLog('SYSTEM', `⚠️ Lock transfer timed out for ${targetLabel} on ${shardId}`, 'warn', { stage: LOG_STAGES.FAILED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.TRANSFER_LOCK });
                
                // Rollback Hostile Takeover Escrow
                const attackerUuid = targetId; // The attacker is the one trying to get the lock
                if (isTakeover && this.atcService.takeoverEscrow?.has(attackerUuid)) {
                    const escrow = this.atcService.takeoverEscrow.get(attackerUuid);
                    const attacker = this.atcService.agents.get(escrow.attacker);
                    if (attacker) {
                        attacker.account.balance = this.atcService.treasury._math(attacker.account.balance + escrow.amount);
                        this.atcService.addLog('SYSTEM', `Hostile Takeover timeout. Escrow ${escrow.amount} SOL refunded to ${attacker.displayName}`, 'info', { domain: LOG_DOMAINS.SYSTEM });
                    } else {
                        // If attacker disconnected during timeout, send funds to Treasury Vault to prevent lost funds
                        this.atcService.treasury.systemVault.totalFeesCollected = this.atcService.treasury._math(this.atcService.treasury.systemVault.totalFeesCollected + escrow.amount);
                        this.atcService.addLog('SYSTEM', `Hostile Takeover timeout. Attacker ${escrow.attacker} offline. Escrow ${escrow.amount} SOL routed to System Vault.`, 'warn', { domain: LOG_DOMAINS.SYSTEM });
                    }
                    this.atcService.takeoverEscrow.delete(attackerUuid);
                }

                // Rollback Lock to previous holder
                if (oldHolder && this.atcService.agents.has(oldHolder)) {
                    s.holder = oldHolder;
                    s.lease = oldLease;
                    s.epoch = oldEpoch;
                } else {
                    s.holder = null;
                    s.lease = null;
                    s.epoch = nextEpoch;
                }
                
                s.forcedCandidate = null;
                if (primary === shardId) this.atcService._syncLegacyStateFromShard(primary);
                this.atcService.emitState();
            }
            this.transferTimeoutRefs.delete(String(shardId));
        }, CONSTANTS.TRANSFER_TIMEOUT);
        this.transferTimeoutRefs.set(String(shardId), timeoutRef);

        return { success: true, shardId, epoch: nextEpoch };
    }

    async executeHostileTakeover(attackerUuid, victimUuid, cost) {
        const attacker = this.atcService.agents.get(attackerUuid);
        const victim = this.atcService.agents.get(victimUuid);
        
        if (!attacker || !victim) return false;
        
        if (attacker.account.balance < cost) {
            attacker.log(`❌ Takeover failed: Insufficient funds`, 'warn');
            return false;
        }

        if (!this.atcService.takeoverEscrow) {
            this.atcService.takeoverEscrow = new Map();
        }

        // Deduct and put in escrow
        attacker.account.balance -= cost;
        this.atcService.takeoverEscrow.set(attackerUuid, {
             attacker: attackerUuid,
             victim: victimUuid,
             amount: cost,
             timestamp: Date.now(),
             shardId: this.atcService.getShardIdForAgent(attackerUuid)
        });

        this.atcService.addLog('SYSTEM', `⚔️ ${attacker.id} initiated hostile takeover against ${victim.id}. Funds in escrow.`, 'critical', { stage: LOG_STAGES.EXECUTED, domain: LOG_DOMAINS.LOCK, actionKey: LOG_ACTIONS.TRANSFER_LOCK });
        
        const result = await this.transferLock(attackerUuid, true);
        return result.success;
    }
}

module.exports = LockDirector;
