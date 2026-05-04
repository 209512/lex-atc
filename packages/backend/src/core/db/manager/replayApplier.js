const { EVENT_TYPES } = require('@lex-atc/shared');

const upsertSnapshotsToMap = async ({ manager, atcService }) => {
    const snapshots = await manager.loadAllSnapshots();
    if (!atcService?.sharedClient || snapshots.length === 0) return;
    const CONSTANTS = require('../../../config/constants');
    const map = await atcService.sharedClient.getMap(CONSTANTS.MAP_AGENT_STATES);
    for (const s of snapshots) {
        const agentUuid = String(s.agent_uuid);
        await map.put(agentUuid, {
            uuid: agentUuid,
            address: s.address || null,
            model: s.model || null,
            position: s.position || null,
            account: s.account || {},
            stats: s.stats || {},
            snapshotGlobalSeq: Number(s.snapshot_global_seq || 0),
            snapshotCreatedAt: s.snapshot_created_at || null,
        });
    }
};

const applyEventToEngines = ({ atcService, event }) => {
    if (atcService.isolationEngine && typeof atcService.isolationEngine.applyEvent === 'function') {
        if (String(event.action || '').startsWith('TASK_')) {
            atcService.isolationEngine.applyEvent(event);
        }
    }

    if (atcService.governanceEngine && typeof atcService.governanceEngine.applyEvent === 'function') {
        if (String(event.action || '').startsWith('GOV_')) {
            atcService.governanceEngine.applyEvent(event);
        }
    }
};

const applyEventToShard = ({ atcService, event }) => {
    const shardId = event.shard_id;
    const shard = atcService.state?.shards?.[shardId];
    if (!shard) return;
    const payload = event.payload || {};

    if (event.action === EVENT_TYPES.SHARD_EPOCH_BUMP) {
        shard.epoch = Number(payload.epoch ?? shard.epoch);
        shard.resourceId = String(payload.resourceId ?? shard.resourceId);
        shard.holder = null;
        shard.fencingToken = null;
        shard.lease = null;
        shard.forcedCandidate = payload.forcedCandidate || null;
        return;
    }

    if (event.action === EVENT_TYPES.LOCK_ACQUIRED) {
        shard.holder = String(event.actor_uuid);
        shard.fencingToken = String(event.fence_token || '');
        shard.resourceId = String(event.resource_id || shard.resourceId);
        shard.epoch = Number(event.shard_epoch);
        shard.lease = payload.lease || shard.lease;
        return;
    }

    if (event.action === EVENT_TYPES.LOCK_RELEASED) {
        if (String(shard.holder) === String(event.actor_uuid)) {
            shard.holder = null;
            shard.fencingToken = null;
            shard.lease = null;
        }
    }
};

module.exports = { upsertSnapshotsToMap, applyEventToEngines, applyEventToShard };

