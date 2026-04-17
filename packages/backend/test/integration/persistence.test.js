describe('L2 persistence (memory)', () => {
  const loadDb = async () => {
    jest.resetModules();
    process.env.DB_MODE = 'memory';
    process.env.DB_MEMORY_NAMESPACE = `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const db = require('../../src/core/DatabaseManager');
    await db.init();
    return db;
  };

  test('idempotent correlation_id prevents duplicates', async () => {
    const db = await loadDb();

    const first = await db.appendEvent({
      globalSeq: 0,
      shardId: 'RG-0',
      shardSeq: 0,
      shardEpoch: 0,
      resourceId: 'lock:RG-0:e0',
      fenceToken: null,
      action: 'LOCK_RELEASED',
      actorUuid: 'agent-1',
      correlationId: 'g0:LOCK_RELEASED:agent-1',
      payload: {}
    });

    const second = await db.appendEvent({
      globalSeq: 0,
      shardId: 'RG-0',
      shardSeq: 0,
      shardEpoch: 0,
      resourceId: 'lock:RG-0:e0',
      fenceToken: null,
      action: 'LOCK_RELEASED',
      actorUuid: 'agent-1',
      correlationId: 'g0:LOCK_RELEASED:agent-1',
      payload: {}
    });

    expect(first).toEqual({ inserted: true });
    expect(second).toEqual({ inserted: false });
  });

  test('out-of-order or gap shard sequence is buffered without dropping', async () => {
    const db = await loadDb();

    await db.appendEvent({
      globalSeq: 0,
      shardId: 'RG-0',
      shardSeq: 0,
      shardEpoch: 0,
      resourceId: 'lock:RG-0:e0',
      fenceToken: null,
      action: 'LOCK_ACQUIRED',
      actorUuid: 'agent-1',
      correlationId: 'g0:LOCK_ACQUIRED:agent-1',
      payload: {}
    });

    const result = await db.appendEvent({
      globalSeq: 1,
      shardId: 'RG-0',
      shardSeq: 3,
      shardEpoch: 0,
      resourceId: 'lock:RG-0:e0',
      fenceToken: null,
      action: 'LOCK_RELEASED',
      actorUuid: 'agent-1',
      correlationId: 'g1:LOCK_RELEASED:agent-1',
      payload: {}
    });

    expect(result).toEqual({ inserted: true });
  });

  test('replay updates shard state from append-only events', async () => {
    const db = await loadDb();

    await db.appendEvent({
      globalSeq: 0,
      shardId: 'RG-0',
      shardSeq: 0,
      shardEpoch: 0,
      resourceId: 'traffic-control-lock:RG-0:e0',
      fenceToken: '10',
      action: 'LOCK_ACQUIRED',
      actorUuid: 'agent-1',
      correlationId: 'g0:LOCK_ACQUIRED:agent-1',
      payload: { lease: { startsAt: 1, endsAt: 2, durationMs: 1 } }
    });

    await db.appendEvent({
      globalSeq: 1,
      shardId: 'RG-0',
      shardSeq: 1,
      shardEpoch: 0,
      resourceId: 'traffic-control-lock:RG-0:e0',
      fenceToken: null,
      action: 'LOCK_RELEASED',
      actorUuid: 'agent-1',
      correlationId: 'g1:LOCK_RELEASED:agent-1',
      payload: {}
    });

    const atc = {
      state: {
        shards: {
          'RG-0': {
            shardId: 'RG-0',
            epoch: 0,
            resourceId: 'traffic-control-lock:RG-0:e0',
            holder: null,
            fencingToken: null,
            lease: null,
            forcedCandidate: null,
            waitingAgents: [],
            lastEscalationStep: -1,
          }
        }
      },
      getShardIds: () => ['RG-0'],
      _syncLegacyStateFromShard: () => {},
      emitState: () => {},
    };

    await db.replayToHazelcast(atc);
    expect(atc.state.shards['RG-0'].holder).toBe(null);
    expect(atc.state.shards['RG-0'].lease).toBe(null);
  });
});
