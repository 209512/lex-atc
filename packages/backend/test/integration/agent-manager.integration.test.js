describe('AgentManager lifecycle (integration with scaling rules)', () => {
  test('scaling down keeps priority agents and removes highest numbered agents first', async () => {
    jest.resetModules();
    process.env.UPDATE_POOL_DELAY = '0';
    process.env.MAX_AGENT_COUNT = '10';

    const terminated = [];

    jest.doMock('../../src/core/Agent', () => {
      return function MockAgent(name) {
        this.uuid = name.toLowerCase();
        this.id = name;
        this.account = { address: 'A', balance: 1, escrow: 1, reputation: 100, difficulty: 4, totalEarned: 0, lastWorkHash: '0x0' };
        this.start = async () => {};
        this.stop = async () => {};
        this.log = () => {};
      };
    });

    jest.doMock('../../src/core/HazelcastManager', () => ({
      getClient: () => null,
    }));

    const AgentManager = require('../../src/core/AgentManager');

    const atc = {
      agents: new Map(),
      agentConfigs: new Map(),
      state: { priorityAgents: [], activeAgentCount: 0 },
      sharedClient: null,
      addLog() {},
      emitState() {},
      clearAgentLogs() {},
    };
    const mgr = new AgentManager(atc);
    mgr.terminateAgent = async (uuid) => { terminated.push(uuid); atc.agents.delete(uuid); return true; };

    const mk = (n) => ({ uuid: `agent-${n}`, id: `Agent-${n}`, stop: async () => {} });
    atc.agents.set('agent-1', mk(1));
    atc.agents.set('agent-2', mk(2));
    atc.agents.set('agent-3', mk(3));
    atc.agents.set('agent-4', mk(4));
    atc.agents.set('agent-5', mk(5));

    atc.state.priorityAgents = ['agent-5'];

    await mgr._executeScaling(3);

    expect(terminated).toContain('agent-4');
    expect(terminated).toContain('agent-3');
    expect(terminated).not.toContain('agent-5');
  });

  test('scaling up fills missing numbers (candidate search)', async () => {
    jest.resetModules();
    process.env.UPDATE_POOL_DELAY = '0';
    process.env.MAX_AGENT_COUNT = '10';
    process.env.MAX_CANDIDATE_NUMBER = '20';

    const spawned = [];

    jest.doMock('../../src/core/Agent', () => {
      return function MockAgent(name) {
        this.uuid = `uuid-${name}`;
        this.id = name;
        this.account = { address: 'A', balance: 1, escrow: 1, reputation: 100, difficulty: 4, totalEarned: 0, lastWorkHash: '0x0' };
        this.start = async () => {};
        this.stop = async () => {};
        this.log = () => {};
      };
    });

    jest.doMock('../../src/core/HazelcastManager', () => ({
      getClient: () => null,
    }));

    const AgentManager = require('../../src/core/AgentManager');
    const mgr = new AgentManager({
      agents: new Map(),
      agentConfigs: new Map(),
      state: { priorityAgents: [], activeAgentCount: 0 },
      sharedClient: null,
      addLog() {},
      emitState() {},
      clearAgentLogs() {},
    });

    mgr.atcService.agents.set('uuid-Agent-1', { uuid: 'uuid-Agent-1', id: 'Agent-1' });
    mgr.atcService.agents.set('uuid-Agent-3', { uuid: 'uuid-Agent-3', id: 'Agent-3' });

    mgr._spawnAgent = async (name) => { spawned.push(name); };
    await mgr._executeScaling(4);

    expect(spawned).toContain('Agent-2');
    expect(spawned.length).toBe(2);
  });
});
