// backend/src/core/LockDirector.js
const hazelcastManager = require('./HazelcastManager');
const CONSTANTS = require('../config/constants');
const { LOG_DOMAINS, LOG_STAGES, LOG_ACTIONS } = require('@lex-atc/shared');
const logger = require('../utils/logger');
const verifyFencingToken = require('./lockDirector/fencing');
const { humanOverride, releaseHumanLock } = require('./lockDirector/adminOverride');
const transferLock = require('./lockDirector/transfer');
const executeHostileTakeover = require('./lockDirector/hostileTakeover');

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
        return verifyFencingToken(this, shardId, token);
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
        return humanOverride(this);
    }

    async releaseHumanLock() {
        return releaseHumanLock(this);
    }

    async transferLock(targetId, isTakeover = false) {
        const res = await transferLock(this, targetId, isTakeover);
        return { success: Boolean(res.success), shardId: res.shardId, epoch: res.epoch, error: res.error };
    }

    async executeHostileTakeover(attackerUuid, victimUuid, cost) {
        return executeHostileTakeover(this, attackerUuid, victimUuid, cost);
    }
}

module.exports = LockDirector;
