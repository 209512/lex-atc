const { FakeHazelcastClient, createFakeSequencer } = require('../helpers/FakeHazelcast');
const { SYSTEM } = require('@lex-atc/shared');

describe('Lock flow integration', () => {
  const flush = () => new Promise((r) => setImmediate(r));

  const setup = async () => {
    jest.resetModules();
    process.env.DB_MODE = 'memory';
    process.env.DB_MEMORY_NAMESPACE = `lock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    process.env.LOCK_LEASE_MS = '1000';

    const db = require('../../src/core/DatabaseManager');
    await db.init();

    const atc = require('../../src/services/atc.service');
    const JobQueue = require('../../src/core/queue/JobQueue');
    JobQueue.registerQueue('audit-queue', async (job) => {
        if (job.name.startsWith('econ:')) {
            await atc.recordEconomicEvent(atc.agents.get(job.data.agentUuid), job.data.params);
        } else {
            await atc.recordEvent(job.data);
        }
    });

    const logs = [];
    atc.addLog = (_agentId, message, type) => { logs.push({ message, type }); };
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

    return { atc, db, logs };
  };

  test('acquire -> release appends events and updates shard state', async () => {
    const { atc, db } = await setup();

    atc.handleAgentAcquired({ id: 'agent-1', fence: '10', latency: 5, shardId: 'RG-0', epoch: 0, resourceId: 'traffic-control-lock:RG-0:e0', ticket: 0 });
    await flush();
    expect(atc.state.shards['RG-0'].holder).toBe('agent-1');
    expect(atc.state.shards['RG-0'].lease).toBeTruthy();

    atc.handleAgentReleased({ id: 'agent-1', shardId: 'RG-0' });
    await flush();
    expect(atc.state.shards['RG-0'].holder).toBe(null);
    expect(atc.state.shards['RG-0'].lease).toBe(null);

    const events = await db.loadEventsAfter(-1);
    const actions = events.map(e => e.action);
    expect(actions).toContain('LOCK_ACQUIRED');
    expect(actions).toContain('LOCK_RELEASED');
  });

  test('transferLock sets forced candidate and clears on acquire', async () => {
    const { atc, logs } = await setup();
    atc.isAgentPaused = async () => false;
    atc.agents.set('agent-7', { uuid: 'agent-7', id: 'Agent-7' });

    const r = await atc.transferLock('agent-7');
    expect(r.success).toBe(true);
    expect(atc.state.shards['RG-0'].forcedCandidate?.uuid).toBe('agent-7');

    atc.handleAgentAcquired({ id: 'agent-7', fence: '11', latency: 5, shardId: 'RG-0', epoch: 1, resourceId: atc.state.shards['RG-0'].resourceId, ticket: 0 });
    await flush();
    expect(atc.state.shards['RG-0'].forcedCandidate).toBe(null);
    expect(atc.state.shards['RG-0'].holder).toBe('agent-7');
    expect(logs.map((entry) => entry.message)).toEqual(expect.arrayContaining([
      '⚡ Lock transfer started to Agent-7 on RG-0',
      '✨ Success: Received Transferred Lock (RG-0)',
    ]));
  });

  test('humanOverride slashes current holder and takes over', async () => {
    const { atc, db } = await setup();

    atc.agents.set('agent-1', {
      uuid: 'agent-1',
      id: 'Agent-1',
      account: { address: 'A', balance: 1, escrow: 1, reputation: 100, difficulty: 4, totalEarned: 0, lastWorkHash: '0x0' },
      log() {},
    });

    atc.state.shards['RG-0'].holder = 'agent-1';
    atc._syncLegacyStateFromShard('RG-0');

    const res = await atc.humanOverride();
    await flush();
    expect(res.success).toBe(true);
    expect(atc.state.overrideSignal).toBe(true);
    expect(atc.state.holder).toBe(SYSTEM.ADMIN_HOLDER_ID);
    expect(atc.agents.get('agent-1').account.balance).toBeLessThan(1);

    const events = await db.loadEventsAfter(-1);
    const actions = events.map(e => e.action);
    expect(actions).toContain('SHARD_EPOCH_BUMP');
    expect(actions).toContain('SLASHING');
  });
});
