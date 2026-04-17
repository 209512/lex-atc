describe('Stress / simulation smoke', () => {
  test('runs simulation and enforces invariants', async () => {
    jest.resetModules();
    process.env.LOCK_LEASE_MS = '5000';
    process.env.MONITOR_INTERVAL_MS = '50';
    process.env.HEARTBEAT_STALE_MS = '100000';
    process.env.ACTIVITY_STALE_MS = '100000';
    process.env.ESCALATION_STEP_MS = '0';

    const { simulate } = require('../../src/stress/simulate');
    const res = await simulate({ agentCount: 20, iterations: 400, shardCount: 4, seed: 42 });
    expect(res.agents).toBe(20);
    expect(res.shards).toBe(4);
    expect(res.events).toBeGreaterThan(200);
  }, 20000);

  test('queues events during temporary DB outage and replays in order after recovery', async () => {
    jest.resetModules();

    const { EVENT_TYPES } = require('@lex-atc/shared');
    const db = require('../../src/core/DatabaseManager');

    db.stop();
    db.mode = 'pg';
    db.redis = null;
    db.eventBuffer = [];
    db.pendingCheckpoints = new Map();

    const stored = new Map();
    let down = true;

    const upsertEvent = (row) => {
      const key = String(row.correlation_id);
      if (!stored.has(key)) stored.set(key, row);
    };

    const pool = {
      async connect() {
        return {
          async query(q, params) {
            const sql = String(q || '');
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
            if (sql.includes('INSERT INTO event_logs')) {
              if (down) throw new Error('DB_CONN_SUSPENDED');
              const batch = [];
              for (let i = 0; i < params.length; i += 12) {
                batch.push({
                  id: params[i + 0],
                  global_seq: params[i + 1],
                  shard_id: params[i + 2],
                  shard_seq: params[i + 3],
                  shard_epoch: params[i + 4],
                  resource_id: params[i + 5],
                  fence_token: params[i + 6],
                  actor_uuid: params[i + 7],
                  action: params[i + 8],
                  correlation_id: params[i + 9],
                  payload: params[i + 10],
                  created_at: params[i + 11],
                });
              }
              for (const row of batch) upsertEvent(row);
              return { rows: [] };
            }
            if (sql.includes('INSERT INTO shard_checkpoints')) return { rows: [] };
            throw new Error('UNEXPECTED_QUERY');
          },
          release() {},
        };
      },
      async query(q, params) {
        const sql = String(q || '');
        if (sql.includes('SELECT * FROM event_logs')) {
          const after = Number(params?.[0] ?? -1);
          const rows = Array.from(stored.values())
            .filter(e => Number(e.global_seq) > after)
            .sort((a, b) => Number(a.global_seq) - Number(b.global_seq));
          return { rows };
        }
        if (sql === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
        throw new Error('UNEXPECTED_QUERY');
      }
    };

    db.postgresAdapter.pool = pool;
    db.loadAllSnapshots = async () => [];
    db.getSnapshotGlobalSeq = async () => -1;

    const events = [
      { globalSeq: 0, shardSeq: 0, shardId: 'RG-0', shardEpoch: 0, resourceId: 'traffic-control-lock:RG-0:e0', fenceToken: null, action: EVENT_TYPES.SHARD_EPOCH_BUMP, actorUuid: 'SYSTEM', correlationId: 'c0', payload: { shardId: 'RG-0', epoch: 1, resourceId: 'traffic-control-lock:RG-0:e1', forcedCandidate: null } },
      { globalSeq: 1, shardSeq: 1, shardId: 'RG-0', shardEpoch: 1, resourceId: 'traffic-control-lock:RG-0:e1', fenceToken: '11', action: EVENT_TYPES.LOCK_ACQUIRED, actorUuid: 'agent-1', correlationId: 'c1', payload: { lease: null } },
      { globalSeq: 2, shardSeq: 2, shardId: 'RG-0', shardEpoch: 1, resourceId: 'traffic-control-lock:RG-0:e1', fenceToken: null, action: EVENT_TYPES.LOCK_RELEASED, actorUuid: 'agent-1', correlationId: 'c2', payload: {} },
    ];

    for (const e of events) {
      const inserted = await db.appendEvent(e);
      expect(inserted.inserted).toBe(true);
    }

    const logger = require('../../src/utils/logger');
    const originalError = logger.error;
    const errSpy = jest.spyOn(logger, 'error').mockImplementation((...args) => {
      const msg = String(args?.[0] || '');
      if (msg.includes('[DatabaseManager] Bulk insert error') || msg.includes('DB_CONN_SUSPENDED')) return;
      originalError(...args);
    });
    await db.flushEventBuffer();
    errSpy.mockRestore();
    expect(db.eventBuffer.length).toBe(events.length);
    expect(stored.size).toBe(0);

    down = false;
    await db.flushEventBuffer();
    expect(db.eventBuffer.length).toBe(0);
    expect(stored.size).toBe(events.length);

    const loaded = await db.loadEventsAfter(-1);
    expect(loaded.map(e => Number(e.global_seq))).toEqual([0, 1, 2]);

    const atc2 = {
      state: {
        shards: {
          'RG-0': { shardId: 'RG-0', epoch: 0, resourceId: 'traffic-control-lock:RG-0:e0', holder: null, fencingToken: null, forcedCandidate: null, waitingAgents: [], lease: null, lastEscalationStep: -1 },
        }
      },
      getShardIds: () => ['RG-0'],
      _syncLegacyStateFromShard() {},
      emitState() {},
    };

    await db.replayToHazelcast(atc2);
    expect(atc2.state.shards['RG-0'].epoch).toBe(1);
    expect(atc2.state.shards['RG-0'].resourceId).toBe('traffic-control-lock:RG-0:e1');
    expect(atc2.state.shards['RG-0'].holder).toBe(null);
  });

  test('ShardedSequencer continues epoch advancement across transient CP failures', async () => {
    jest.resetModules();

    class StableAtomicLong {
      constructor() { this.value = 0; }
      async get() { return this.value; }
      async getAndIncrement() { const c = this.value; this.value += 1; return c; }
      async incrementAndGet() { this.value += 1; return this.value; }
    }

    class FlakyAtomicLong extends StableAtomicLong {
      constructor() {
        super();
        this.failOnce = true;
      }
      async incrementAndGet() {
        if (this.failOnce) {
          this.failOnce = false;
          throw new Error('CP_MEMBER_LEFT');
        }
        return super.incrementAndGet();
      }
    }

    class FakeCP {
      constructor() { this.longs = new Map(); }
      async getAtomicLong(name) {
        const k = String(name);
        if (!this.longs.has(k)) {
          if (k.includes('lex:epoch:')) this.longs.set(k, new FlakyAtomicLong());
          else this.longs.set(k, new StableAtomicLong());
        }
        return this.longs.get(k);
      }
    }

    const cp = new FakeCP();
    const fakeClient = {
      getCPSubsystem() { return cp; },
      async getMap() { return { put: async () => {}, entrySet: async () => [] }; }
    };

    const ShardedSequencer = require('../../src/core/ShardedSequencer');
    const seq = new ShardedSequencer();
    await seq.init(fakeClient);

    const e1 = await seq.bumpEpoch('RG-0');
    const e2 = await seq.bumpEpoch('RG-0');
    expect(e1).toBe(1);
    expect(e2).toBe(2);
  });
});
