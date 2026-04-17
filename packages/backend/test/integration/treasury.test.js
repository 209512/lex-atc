const Treasury = require('../../src/core/Treasury');
const JobQueue = require('../../src/core/queue/JobQueue');

describe('Treasury & reputation', () => {
  beforeAll(() => {
    JobQueue.registerQueue('audit-queue', async (job) => {
      const atc = global.testAtc;
      if (atc && job.name.startsWith('econ:')) {
        await atc.recordEconomicEvent(null, job.data.params);
      }
    });
  });
  const mkAgent = (balance = 10) => {
    const logs = [];
    return {
      uuid: 'agent-1',
      id: 'Agent-1',
      account: {
        address: 'A',
        balance,
        escrow: 1,
        reputation: 80,
        difficulty: 4,
        totalEarned: 0,
        lastWorkHash: '0x0'
      },
      log(msg, lvl) { logs.push({ msg, lvl }); },
      _logs: logs,
    };
  };

  const mkAtc = () => {
    const events = [];
    const atc = {
      state: { shards: { 'RG-0': { epoch: 0, resourceId: 'traffic-control-lock:RG-0:e0' } } },
      getShardIdForAgent() { return 'RG-0'; },
      async recordEconomicEvent(_agent, e) { events.push(e); return { ok: true }; },
      _events: events,
    };
    global.testAtc = atc;
    return atc;
  };

  test('collectEntryFee deducts balance and records event', () => {
    const atc = mkAtc();
    global.testAtc = atc;
    const tr = new Treasury(atc);
    const agent = mkAgent(10);

    const ok = tr.collectEntryFee(agent, { shardId: 'RG-0', shardEpoch: 0, resourceId: 'r', fenceToken: '1' });
    expect(ok).toBe(true);
    expect(agent.account.balance).toBeLessThan(10);
    expect(tr.systemVault.totalFeesCollected).toBeGreaterThan(0);
    expect(atc._events[0].action).toBe('ENTRY_FEE');
    expect(atc._events[0].payload.deltaBalance).toBeLessThan(0);
  });

  test('collectEntryFee fails on insufficient funds', () => {
    const atc = mkAtc();
    global.testAtc = atc;
    const tr = new Treasury(atc);
    const agent = mkAgent(0);
    const ok = tr.collectEntryFee(agent);
    expect(ok).toBe(false);
    expect(atc._events.length).toBe(0);
  });

  test('distributeReward increases balance, earned, and reputation capped at 100', () => {
    const atc = mkAtc();
    global.testAtc = atc;
    const tr = new Treasury(atc);
    const agent = mkAgent(1);
    agent.account.reputation = 99;

    tr.distributeReward(agent, { shardId: 'RG-0', shardEpoch: 0, resourceId: 'r', fenceToken: '1' });
    expect(agent.account.balance).toBeGreaterThan(1);
    expect(agent.account.totalEarned).toBeGreaterThan(0);
    expect(agent.account.reputation).toBe(100);
    expect(atc._events[0].action).toBe('REWARD');
    expect(atc._events[0].payload.deltaReputation).toBe(1);
  });

  test('applySlashing deducts fine up to balance, reduces reputation, increases difficulty capped at 6', () => {
    const atc = mkAtc();
    const tr = new Treasury(atc);
    const agent = mkAgent(0.1);
    agent.account.reputation = 5;
    agent.account.difficulty = 5;

    tr.applySlashing(agent, 'TEST', { shardId: 'RG-0', shardEpoch: 0, resourceId: 'r', fenceToken: '1' });
    expect(agent.account.balance).toBeGreaterThanOrEqual(0);
    expect(agent.account.reputation).toBe(0);
    expect(agent.account.difficulty).toBe(6);
    expect(tr.systemVault.totalFeesCollected).toBeGreaterThan(0);
    expect(atc._events[0].action).toBe('SLASHING');
    expect(atc._events[0].payload.reason).toBe('TEST');
  });
});

