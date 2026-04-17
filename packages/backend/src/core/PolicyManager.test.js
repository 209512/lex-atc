const PolicyManager = require('./PolicyManager');
const { SYSTEM } = require('@lex-atc/shared');

describe('PolicyManager', () => {
  const create = ({ globalStop = false, overrideSignal = false, priorityAgents = [], forcedCandidate = null, holder = null, paused = new Set(), agentsPresent = new Set(), shardId = 'RG-0' } = {}) => {
    const atc = {
      agents: new Map(Array.from(agentsPresent).map(id => [id, { uuid: id } ])),
      state: {
        globalStop,
        overrideSignal,
        priorityAgents,
        shards: {
          [shardId]: {
            shardId,
            forcedCandidate,
            holder,
          }
        }
      },
      async isAgentPaused(id) { return paused.has(String(id)); },
      getShardIdForAgent() { return shardId; },
      addLog() {},
      lockDirector: { refreshResourceId() {} },
      emitState() {},
    };
    return { atc, pm: new PolicyManager(atc) };
  };

  test('blocks acquisition during global stop', async () => {
    const { pm } = create({ globalStop: true });
    await expect(pm.canAgentAcquire('agent-1')).resolves.toBe(false);
  });

  test('blocks acquisition when paused', async () => {
    const { pm } = create({ paused: new Set(['agent-1']) });
    await expect(pm.canAgentAcquire('agent-1')).resolves.toBe(false);
  });

  test('override allows only Human (Admin)', async () => {
    const { pm } = create({ overrideSignal: true });
    await expect(pm.canAgentAcquire('agent-1')).resolves.toBe(false);
    await expect(pm.canAgentAcquire(SYSTEM.ADMIN_HOLDER_ID)).resolves.toBe(true);
  });

  test('forcedCandidate gates acquisition per-shard', async () => {
    const { pm } = create({ forcedCandidate: { uuid: 'agent-9', epoch: 1 } });
    await expect(pm.canAgentAcquire('agent-1')).resolves.toBe(false);
    await expect(pm.canAgentAcquire('agent-9')).resolves.toBe(true);
  });

  test('priorityAgents restrict to active priority agents', async () => {
    const { pm } = create({
      priorityAgents: ['p1', 'p2'],
      paused: new Set(['p2']),
      agentsPresent: new Set(['p1', 'p2', 'x'])
    });

    await expect(pm.canAgentAcquire('x')).resolves.toBe(false);
    await expect(pm.canAgentAcquire('p1')).resolves.toBe(true);
    await expect(pm.canAgentAcquire('p2')).resolves.toBe(false);
  });

  test('priorityAgents list with no active entries falls back to allow', async () => {
    const { pm } = create({
      priorityAgents: ['p1', 'p2'],
      paused: new Set(['p1', 'p2']),
      agentsPresent: new Set(['p1', 'p2', 'x'])
    });

    await expect(pm.canAgentAcquire('x')).resolves.toBe(true);
  });
});
