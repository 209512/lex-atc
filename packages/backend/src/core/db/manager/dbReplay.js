const { upsertSnapshotsToMap, applyEventToEngines, applyEventToShard } = require('./replayApplier');

const replayToHazelcast = async (manager, atcService) => {
    if (!atcService) return;

    await upsertSnapshotsToMap({ manager, atcService });

    const base = await manager.getSnapshotGlobalSeq();
    const events = await manager.loadEventsAfter(base);

    for (const e of events) {
        applyEventToEngines({ atcService, event: e });
        applyEventToShard({ atcService, event: e });
    }

    const primary = atcService.getShardIds ? atcService.getShardIds()[0] : null;
    if (primary && atcService._syncLegacyStateFromShard) {
        atcService._syncLegacyStateFromShard(primary);
    }
    if (typeof atcService.emitState === 'function') atcService.emitState();
};

module.exports = { replayToHazelcast };
