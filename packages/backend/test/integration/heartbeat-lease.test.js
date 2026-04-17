const { FakeHazelcastClient, createFakeSequencer } = require('../helpers/FakeHazelcast');

describe('Heartbeat & lease expiry monitoring', () => {
  const setup = async () => {
    jest.resetModules();
    process.env.DB_MODE = 'memory';
    process.env.DB_MEMORY_NAMESPACE = `mon-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    process.env.ESCALATION_STEP_MS = '1000';
    process.env.ESCALATION_BASE_FEE = '1';
    process.env.ESCALATION_MULTIPLIER = '2';
    process.env.HEARTBEAT_STALE_MS = '1000';
    process.env.ACTIVITY_STALE_MS = '1000';

    const db = require('../../src/core/DatabaseManager');
    await db.init();

    const CONSTANTS = require('../../src/config/constants');

    const atc = require('../../src/services/atc.service');
    const JobQueue = require('../../src/core/queue/JobQueue');
    JobQueue.registerQueue('audit-queue', async (job) => {
        if (job.name.startsWith('econ:')) {
            await atc.recordEconomicEvent(atc.agents.get(job.data.agentUuid), job.data.params);
        } else {
            await atc.recordEvent(job.data);
        }
    });
    atc.addLog = () => {};
    atc.sequencer = createFakeSequencer();
    atc.sharedClient = new FakeHazelcastClient();

    atc.state.shards = {
      'RG-0': {
        shardId: 'RG-0',
        epoch: 0,
        resourceId: 'traffic-control-lock:RG-0:e0',
        holder: null,
        fencingToken: null,
        forcedCandidate: null,
        waitingAgents: [],
        lease: null,
        lastEscalationStep: -1,
      }
    };
    atc._syncLegacyStateFromShard('RG-0');

    return { atc, db, CONSTANTS };
  };

  test('stale holder triggers epoch bump and clears holder', async () => {
    const { atc, db, CONSTANTS } = await setup();

    const now = Date.now();
    const statusMap = await atc.sharedClient.getMap(CONSTANTS.MAP_AGENT_STATUS);
    await statusMap.put('agent-1', { lastUpdated: now - 10_000, displayName: 'Agent-1' });

    atc.state.shards['RG-0'].holder = 'agent-1';
    atc._syncLegacyStateFromShard('RG-0');

    await atc._monitorShards();

    expect(atc.state.shards['RG-0'].holder).toBe(null);
    expect(atc.state.shards['RG-0'].epoch).toBe(1);

    const events = await db.loadEventsAfter(-1);
    expect(events.some(e => e.action === 'SHARD_EPOCH_BUMP')).toBe(true);
  });

  test('lease expiry slashes holder and bumps epoch', async () => {
    const { atc, db, CONSTANTS } = await setup();

    const now = Date.now();
    const statusMap = await atc.sharedClient.getMap(CONSTANTS.MAP_AGENT_STATUS);
    await statusMap.put('agent-1', { lastUpdated: now, displayName: 'Agent-1' });

    atc.agents.set('agent-1', {
      uuid: 'agent-1',
      id: 'Agent-1',
      account: { address: 'A', balance: 1, escrow: 1, reputation: 100, difficulty: 4, totalEarned: 0, lastWorkHash: '0x0' },
      log() {},
    });

    atc.state.shards['RG-0'].holder = 'agent-1';
    atc.state.shards['RG-0'].lease = { startsAt: now - 10_000, endsAt: now - 1, durationMs: 10_000 };
    atc._touchActivity('agent-1');

    await atc._monitorShards();

    expect(atc.state.shards['RG-0'].holder).toBe(null);
    expect(atc.state.shards['RG-0'].epoch).toBe(1);
    expect(atc.agents.get('agent-1').account.balance).toBeLessThan(1);

    const events = await db.loadEventsAfter(-1);
    const actions = events.map(e => e.action);
    expect(actions).toContain('SLASHING');
    expect(actions).toContain('SHARD_EPOCH_BUMP');
  });

  test('holding fee unpaid triggers slashing and epoch bump', async () => {
    const { atc, db, CONSTANTS } = await setup();

    const now = Date.now();
    const statusMap = await atc.sharedClient.getMap(CONSTANTS.MAP_AGENT_STATUS);
    await statusMap.put('agent-1', { lastUpdated: now, displayName: 'Agent-1' });

    atc.agents.set('agent-1', {
      uuid: 'agent-1',
      id: 'Agent-1',
      account: { address: 'A', balance: 0.1, escrow: 1, reputation: 100, difficulty: 4, totalEarned: 0, lastWorkHash: '0x0' },
      log() {},
    });

    atc.state.shards['RG-0'].holder = 'agent-1';
    atc.state.shards['RG-0'].lease = { startsAt: now - 5000, endsAt: now + 50_000, durationMs: 55_000 };
    atc.state.shards['RG-0'].lastEscalationStep = -1;
    atc._touchActivity('agent-1');

    await atc._monitorShards();

    expect(atc.state.shards['RG-0'].holder).toBe(null);
    expect(atc.state.shards['RG-0'].epoch).toBe(1);

    const events = await db.loadEventsAfter(-1);
    const bump = events.find(e => e.action === 'SHARD_EPOCH_BUMP');
    expect(bump?.payload?.reason).toBe('HOLDING_FEE_UNPAID');
  });
});
