const axios = require('axios');
jest.mock('axios');

describe('L3 Settlement Layer', () => {
  const createAtcAndEngine = async () => {
    jest.resetModules();
    process.env.DB_MODE = 'memory';
    process.env.DB_MEMORY_NAMESPACE = `l3-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    process.env.AGENT_KEY_SEED = 'agent-seed-test';
    process.env.TREASURY_KEY_SEED = 'treasury-seed-test';
    process.env.SETTLEMENT_STALE_MS = '50';

    const db = require('../../src/core/DatabaseManager');
    await db.init();
    const WalletEngine = require('../../src/core/WalletEngine');
    const SettlementEngine = require('../../src/core/settlement/SettlementEngine');

    let g = 0;
    let s = 0;
    const shardCounters = new Map();
    const nextShard = (sid) => {
      const v = shardCounters.get(sid) ?? 0;
      shardCounters.set(sid, v + 1);
      return v;
    };

    const agentUuid = 'agent-1';
    const agentKp = WalletEngine.getAgentKeypair(agentUuid);
    const treasuryAddr = WalletEngine.getTreasuryAddress();

    const atc = {
      agents: new Map(),
      treasury: { systemVault: { address: treasuryAddr, totalFeesCollected: 0, totalRewardsDistributed: 0 } },
      state: { shards: { 'RG-0': { shardId: 'RG-0', epoch: 0, resourceId: 'traffic-control-lock:RG-0:e0' } } },
      getShardIdForAgent: () => 'RG-0',
      sequencer: {
        async nextGlobalSeq() { const v = g; g += 1; return v; },
        async nextShardSeq(shardId) { return nextShard(String(shardId)); }
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
      emitState() {}
    };

    atc.agents.set(agentUuid, {
      uuid: agentUuid,
      address: agentKp.publicKey.toBase58(),
      account: {
        address: agentKp.publicKey.toBase58(),
        balance: 1.23,
        escrow: 0.1,
        reputation: 100,
        difficulty: 4,
        totalEarned: 0,
        lastWorkHash: '0x0'
      },
      stats: { successCount: 0, totalTasks: 0, avgAiLatency: 2000 },
      config: { model: 'Mock' }
    });

    const engine = new SettlementEngine(atc);
    return { db, atc, engine, agentUuid };
  };

  test('Signed Snapshot Validation and storage', async () => {
    const { db, engine, agentUuid } = await createAtcAndEngine();

    const task = {
      taskId: 't-1',
      actorUuid: agentUuid,
      shardId: 'RG-0',
      shardEpoch: 0,
      resourceId: 'traffic-control-lock:RG-0:e0',
      fenceToken: '10',
      classification: 'external',
      status: 'EXECUTED'
    };

    await engine.onTaskExecuted(task, { ok: true });
    await engine.flushPending();

    const channel = await db.getChannel('channel:agent-1');
    expect(Number(channel.last_nonce)).toBe(0);

    const snap = await db.getChannelSnapshot('channel:agent-1', 0);
    expect(snap).toBeTruthy();
    expect(snap.signatures.agent).toBeTruthy();
    expect(snap.signatures.treasury).toBeTruthy();
  });

  test('Nonce monotonicity rejects duplicates', async () => {
    const { db, engine, agentUuid } = await createAtcAndEngine();

    const task = {
      taskId: 't-1',
      actorUuid: agentUuid,
      shardId: 'RG-0',
      shardEpoch: 0,
      resourceId: 'traffic-control-lock:RG-0:e0',
      fenceToken: '10',
      classification: 'external',
      status: 'EXECUTED'
    };
    await engine.onTaskExecuted(task, { ok: true });
    await engine.flushPending();

    const snap0 = await db.getChannelSnapshot('channel:agent-1', 0);
    await expect(db.insertChannelSnapshot({
      id: '00000000-0000-0000-0000-000000000000',
      channelId: 'channel:agent-1',
      nonce: 0,
      balances: snap0.balances,
      stateHash: snap0.state_hash,
      signatures: snap0.signatures,
      disputeWindowMs: snap0.dispute_window_ms,
      validUntil: snap0.valid_until,
      status: 'SIGNED',
      taskId: null,
      globalSeq: 999,
      shardId: 'RG-0',
      shardEpoch: 0,
      resourceId: 'traffic-control-lock:RG-0:e0'
    })).rejects.toThrow(/Stale nonce|Duplicate state hash/);
  });

  test('Stale settlement rejection', async () => {
    const { engine, agentUuid } = await createAtcAndEngine();
    const res = await engine.submitSnapshot({
      channelId: 'channel:agent-1',
      nonce: 0,
      shardId: 'RG-0',
      shardEpoch: 0,
      resourceId: null,
      validUntil: new Date(Date.now() - 1).toISOString()
    }, agentUuid);
    expect(res.ok).toBe(false);
  });

  test('Dispute and slashing interfaces record events', async () => {
    const { db, engine, agentUuid } = await createAtcAndEngine();
    await expect(engine.openDispute({ channelId: 'channel:agent-1', openedBy: agentUuid, targetNonce: 0, reason: 'TEST' }))
      .rejects.toThrow(/SOLANA_SETTLEMENT_DISABLED|SOLANA_RPC_URL_MISSING/);

    const res = await engine.slash({ channelId: 'channel:agent-1', actorUuid: agentUuid, reason: 'BAD_SIG' });
    expect(res.ok).toBe(true);
    expect(res.txid).toContain('mock-txid');

    const events = await db.loadEventsAfter(-1);
    const actions = events.map(e => e.action);
    expect(actions).toContain('DISPUTE_OPEN_FAILED');
    expect(actions).toContain('SETTLEMENT_SLASH');
  });

  test('Missing deterministic keys blocks settlement snapshot creation', async () => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.DB_MODE = 'memory';
    process.env.DB_MEMORY_NAMESPACE = `l3-mock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    delete process.env.AGENT_KEY_SEED;
    delete process.env.TREASURY_KEY_SEED;
    const oldAllowTest = process.env.ALLOW_TEST_DUMMY_KEYS;
    delete process.env.ALLOW_TEST_DUMMY_KEYS;

    const db = require('../../src/core/DatabaseManager');
    await db.init();
    const WalletEngine = require('../../src/core/WalletEngine');
    const SettlementEngine = require('../../src/core/settlement/SettlementEngine');

    let g = 0;
    let s = 0;
    const atc = {
      agents: new Map(),
      treasury: { systemVault: { address: WalletEngine.getTreasuryAddress(), totalFeesCollected: 0, totalRewardsDistributed: 0 } },
      state: { shards: { 'RG-0': { shardId: 'RG-0', epoch: 0, resourceId: 'traffic-control-lock:RG-0:e0' } } },
      getShardIdForAgent: () => 'RG-0',
      sequencer: {
        async nextGlobalSeq() { const v = g; g += 1; return v; },
        async nextShardSeq() { return 0; }
      },
      async recordEvent({ shardId, shardEpoch, resourceId, fenceToken, action, actorUuid, correlationId, payload }) {
        return db.appendEvent({
          globalSeq: await this.sequencer.nextGlobalSeq(),
          shardId,
          shardSeq: s++,
          shardEpoch,
          resourceId,
          fenceToken,
          action,
          actorUuid,
          correlationId,
          payload
        });
      },
      emitState() {}
    };

    const agentUuid = 'agent-1';
    const wallet = WalletEngine.generateSovereignWallet();
    atc.agents.set(agentUuid, {
      uuid: agentUuid,
      address: wallet.address,
      account: { address: wallet.address, balance: 1, escrow: 0.1, reputation: 100, difficulty: 4, totalEarned: 0, lastWorkHash: '0x0' },
      stats: { successCount: 0, totalTasks: 0, avgAiLatency: 2000 },
      config: { model: 'Mock' }
    });

    const engine = new SettlementEngine(atc);
    await engine.onTaskExecuted({
      taskId: 't-mock',
      actorUuid: agentUuid,
      shardId: 'RG-0',
      shardEpoch: 0,
      resourceId: 'traffic-control-lock:RG-0:e0',
      fenceToken: '10',
      classification: 'external',
      status: 'EXECUTED'
    }, { ok: true });
    await engine.flushPending();

    const snap = await db.getChannelSnapshot('channel:agent-1', 0);
    expect(snap).toBeNull();
    const ch = await db.getChannel('channel:agent-1');
    expect(Number(ch.last_nonce)).toBe(-1);
    process.env.ALLOW_TEST_DUMMY_KEYS = oldAllowTest;
  });

  test('AI Watcher falls back to heuristics if ML API fails', async () => {
    process.env.ML_INFERENCE_API_URL = 'http://127.0.0.1:8000/predict';
    const { db, engine, agentUuid } = await createAtcAndEngine();

    // Mock axios to simulate a timeout or connection refused error
    axios.post.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:8000'));

    const agent = engine.atcService.agents.get(agentUuid);
    // Trigger heuristic by forcing a rapid drain
    agent.account.initialBalance = 1000;
    agent.account.balance = 400; // 60% drop (threshold is > 50%)

    // Mock a channel snapshot to trigger monitoring
    engine.lastSnapshotByChannel.set(`channel:${agentUuid}`, {
        nonce: 10,
        stateHash: 'test-hash'
    });

    // Run watcher manually
    await engine._runAutoMonitoring();

    // Check DB for the recorded dispute event
    const events = await db.loadEventsAfter(-1);
    const disputeEvent = events.find(e => e.action === 'DISPUTE_OPEN_FAILED' && e.payload.reason === 'AUTO_DETECTED_RAPID_DRAIN');
    
    expect(disputeEvent).toBeDefined();
    expect(disputeEvent.actor_uuid).toBe('AI-WATCHER');

    await engine.stop();
  });
});
