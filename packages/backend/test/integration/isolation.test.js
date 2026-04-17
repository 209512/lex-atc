describe('Differentiated Isolation', () => {
  const createAtc = async () => {
    jest.resetModules();
    process.env.DB_MODE = 'memory';
    process.env.DB_MEMORY_NAMESPACE = `iso-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    process.env.ISOLATION_TASK_TIMEOUT_MS = '1000';
    const db = require('../../src/core/DatabaseManager');
    await db.init();

    const shardCounters = new Map();
    const nextShard = (sid) => {
      const v = shardCounters.get(sid) ?? 0;
      shardCounters.set(sid, v + 1);
      return v;
    };
    let g = 0;
    const atc = {
      state: { isolation: { pending: [] } },
      sequencer: {
        async nextGlobalSeq() { const v = g; g += 1; return v; },
        async nextShardSeq(shardId) { return nextShard(String(shardId)); },
      },
      async recordEvent({ shardId, shardEpoch, resourceId, fenceToken, action, actorUuid, correlationId, payload }) {
        const globalSeq = await atc.sequencer.nextGlobalSeq();
        const shardSeq = await atc.sequencer.nextShardSeq(shardId);
        const cid = correlationId || `g${globalSeq}:${action}:${actorUuid}`;
        await db.appendEvent({
          globalSeq,
          shardId: String(shardId),
          shardSeq,
          shardEpoch: Number(shardEpoch),
          resourceId: resourceId || null,
          fenceToken: fenceToken || null,
          action,
          actorUuid,
          correlationId: cid,
          payload
        });
        return { globalSeq, shardSeq, correlationId: cid };
      },
      emitState() {},
    };

    const IsolationPolicyEngine = require('../../src/core/isolation/IsolationPolicyEngine');
    const engine = new IsolationPolicyEngine(atc);
    atc.isolationEngine = engine;
    return { atc, db, engine };
  };

  test('reversible task stays pending before finalize', async () => {
    const { engine, db } = await createAtc();
    const res = await engine.createIntent({
      actorUuid: 'agent-1',
      shardId: 'RG-0',
      shardEpoch: 0,
      resourceId: 'traffic-control-lock:RG-0:e0',
      fenceToken: '10',
      text: 'reversible: update internal state'
    });

    expect(res.status).toBe('PENDING');
    const t = engine.tasks.get(res.taskId);
    expect(t.status).toBe('PENDING');
    expect(t.requiresFinalization).toBe(true);

    const fin = await engine.finalize(res.taskId, 'ADMIN');
    expect(fin.success).toBe(true);
    expect(fin.status).toBe('EXECUTED');

    const events = await db.loadEventsAfter(-1);
    const actions = events.map(e => e.action);
    expect(actions).toContain('TASK_INTENT_CREATED');
    expect(actions).toContain('TASK_EXECUTION_DEFERRED');
    expect(actions).toContain('TASK_FINALIZED');
    expect(actions).toContain('TASK_EXECUTED');
  });

  test('irreversible task stays pending before finalize', async () => {
    const { engine } = await createAtc();
    const res = await engine.createIntent({
      actorUuid: 'agent-1',
      shardId: 'RG-0',
      shardEpoch: 0,
      resourceId: 'traffic-control-lock:RG-0:e0',
      fenceToken: '10',
      text: 'irreversible: finalize settlement',
      context: { classification: 'irreversible' }
    });

    expect(res.status).toBe('PENDING');
    const t = engine.tasks.get(res.taskId);
    expect(t.status).toBe('PENDING');
    expect(t.requiresFinalization).toBe(true);
  });

  test('finalize executes pending task and is idempotent', async () => {
    const { engine } = await createAtc();
    const res = await engine.createIntent({
      actorUuid: 'agent-1',
      shardId: 'RG-0',
      shardEpoch: 0,
      resourceId: 'traffic-control-lock:RG-0:e0',
      fenceToken: '10',
      text: 'external: send webhook',
      context: { classification: 'external' }
    });

    const fin1 = await engine.finalize(res.taskId, 'ADMIN');
    expect(fin1.success).toBe(true);
    expect(fin1.status).toBe('EXECUTED');

    const fin2 = await engine.finalize(res.taskId, 'ADMIN');
    expect(fin2.success).toBe(true);
    expect(fin2.idempotent).toBe(true);
  });

  test('rollback blocks later finalize', async () => {
    const { engine } = await createAtc();
    const res = await engine.createIntent({
      actorUuid: 'agent-1',
      shardId: 'RG-0',
      shardEpoch: 0,
      resourceId: 'traffic-control-lock:RG-0:e0',
      fenceToken: '10',
      text: 'external: email user',
      context: { classification: 'external' }
    });

    const rb = await engine.rollback(res.taskId, 'ADMIN', 'ADMIN_OVERRIDE');
    expect(rb.success).toBe(true);
    expect(rb.status).toBe('ROLLED_BACK');

    const fin = await engine.finalize(res.taskId, 'ADMIN');
    expect(fin.success).toBe(false);
  });

  test('timeout transitions to TIMED_OUT and rejects finalize', async () => {
    const { engine } = await createAtc();

    const realNow = Date.now;
    let now = 1000;
    Date.now = () => now;

    const res = await engine.createIntent({
      actorUuid: 'agent-1',
      shardId: 'RG-0',
      shardEpoch: 0,
      resourceId: 'traffic-control-lock:RG-0:e0',
      fenceToken: '10',
      text: 'external: payment',
      context: { classification: 'external' }
    });

    now = 1000 + 2000;
    await engine._poll();

    const t = engine.tasks.get(res.taskId);
    expect(t.status).toBe('TIMED_OUT');

    const fin = await engine.finalize(res.taskId, 'ADMIN');
    expect(fin.success).toBe(false);

    Date.now = realNow;
  });
});
