const db = require('../core/DatabaseManager');
const { FakeHazelcastClient, createFakeSequencer } = require('../testkit/FakeHazelcast');

const setupAtc = async ({ namespace, shardCount }) => {
  process.env.DB_MODE = 'memory';
  process.env.DB_MEMORY_NAMESPACE = namespace;
  await db.init();

  const atc = require('../services/atc.service');
  atc.addLog = () => {};
  atc.emitState = () => {};
  atc.sequencer = createFakeSequencer();
  atc.sharedClient = new FakeHazelcastClient();

  atc.state.shards = {};
  for (let i = 0; i < shardCount; i += 1) {
    const sid = `RG-${i}`;
    atc.state.shards[sid] = {
      shardId: sid,
      epoch: 0,
      resourceId: `traffic-control-lock:${sid}:e0`,
      holder: null,
      fencingToken: null,
      forcedCandidate: null,
      waitingAgents: [],
      lease: null,
      lastEscalationStep: -1,
    };
  }
  atc._syncLegacyStateFromShard(Object.keys(atc.state.shards)[0]);
  return atc;
};

const simulate = async ({ agentCount = 50, iterations = 2000, shardCount = 4, seed = 1 } = {}) => {
  const namespace = `stress-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const atc = await setupAtc({ namespace, shardCount });
  const CONSTANTS = require('../config/constants');

  const statusMap = await atc.sharedClient.getMap(CONSTANTS.MAP_AGENT_STATUS);
  const agents = [];
  const txByAgent = new Map();
  const snapshotWindowsByAgent = new Map();
  const iterationMs = Number(process.env.SIM_ITERATION_MS || 100);
  const snapshotIntervalMs = Number(process.env.SETTLEMENT_SNAPSHOT_INTERVAL_MS || 60_000);
  for (let i = 0; i < agentCount; i += 1) {
    const uuid = `agent-${i}`;
    agents.push(uuid);
    txByAgent.set(uuid, 0);
    snapshotWindowsByAgent.set(uuid, new Set());
    atc.agents.set(uuid, {
      uuid,
      id: `Agent-${i}`,
      account: { address: 'A', balance: 10, escrow: 1, reputation: 100, difficulty: 4, totalEarned: 0, lastWorkHash: '0x0' },
      log() {},
    });
    await statusMap.put(uuid, { lastUpdated: Date.now(), displayName: `Agent-${i}` });
  }


  let rng = seed;
  const rand = () => {
    rng = (rng * 1103515245 + 12345) % 2147483648;
    return rng / 2147483648;
  };

  const pick = () => agents[Math.floor(rand() * agents.length)];
  const shardIds = atc.getShardIds();
  let now = 0;

  for (let i = 0; i < iterations; i += 1) {
    const sid = shardIds[i % shardIds.length];
    const shard = atc.state.shards[sid];
    const uuid = pick();
    now += iterationMs;

    await statusMap.put(uuid, { lastUpdated: Date.now(), displayName: `Agent-${uuid}` });

    if (!shard.holder) {
      await atc.commitAgentAcquired({ id: uuid, fence: String(10 + i), latency: 1, shardId: sid, epoch: shard.epoch, resourceId: shard.resourceId, ticket: i });
      txByAgent.set(uuid, (txByAgent.get(uuid) || 0) + 1);
      const w = Math.floor(now / snapshotIntervalMs);
      snapshotWindowsByAgent.get(uuid).add(w);
    } else {
      if (rand() < 0.35) {
        await atc.commitAgentReleased({ id: shard.holder, shardId: sid });
      } else if (rand() < 0.1) {
        atc.handleAgentWaiting({ id: uuid });
      }
    }

    if (i % 50 === 0) {
      await atc._monitorShards();
    }

    for (const s of shardIds) {
      const sh = atc.state.shards[s];
      if (sh.holder) {
        if (!agents.includes(String(sh.holder))) throw new Error('Invalid holder');
        if ((sh.waitingAgents || []).includes(String(sh.holder))) throw new Error('Holder in waiting list');
      }
    }
    for (const a of agents) {
      const bal = atc.agents.get(a)?.account?.balance;
      if (typeof bal === 'number' && bal < -1e-9) throw new Error('Negative balance');
    }
  }

  const events = await db.loadEventsAfter(-1);
  const solanaFeeSol = Number(process.env.SOLANA_AVG_TX_FEE_SOL || 0.000005);
  const solUsd = Number(process.env.SOLANA_USD_PRICE || 150);
  const immediateTxCount = Array.from(txByAgent.values()).reduce((a, b) => a + b, 0);
  let snapshotTxCount = 0;
  for (const s of snapshotWindowsByAgent.values()) snapshotTxCount += s.size;
  const costAUsd = immediateTxCount * solanaFeeSol * solUsd;
  const costBUsd = snapshotTxCount * solanaFeeSol * solUsd;
  const savedUsd = Math.max(0, costAUsd - costBUsd);
  const savingsPct = costAUsd > 0 ? (savedUsd / costAUsd) * 100 : 0;
  return {
    namespace,
    events: events.length,
    shards: shardIds.length,
    agents: agents.length,
    gas: {
      immediateTxCount,
      snapshotTxCount,
      costAUsd,
      costBUsd,
      savedUsd,
      savingsPct,
      solanaFeeSol,
      solUsd
    }
  };
};

module.exports = { simulate };
