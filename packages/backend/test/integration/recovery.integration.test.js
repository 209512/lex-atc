const { FakeHazelcastClient, createFakeSequencer } = require('../helpers/FakeHazelcast');

describe('Recovery / replay integration', () => {
  test('replay reconstructs shard lock state and governance/isolation projections', async () => {
    jest.resetModules();
    process.env.DB_MODE = 'memory';
    process.env.DB_MEMORY_NAMESPACE = `rec-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    process.env.GOVERNANCE_TIMELOCK_MS = '0';
    process.env.GOVERNANCE_APPROVAL_THRESHOLD = '1';
    process.env.GOVERNANCE_APPROVAL_TOTAL = '1';
    process.env.ISOLATION_TASK_TIMEOUT_MS = '5000';

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

    atc.handleAgentAcquired({ id: 'agent-1', fence: '10', latency: 5, shardId: 'RG-0', epoch: 0, resourceId: 'traffic-control-lock:RG-0:e0', ticket: 0 });

    const task = await atc.isolationEngine.createIntent({
      actorUuid: 'agent-1',
      shardId: 'RG-0',
      shardEpoch: 0,
      resourceId: 'traffic-control-lock:RG-0:e0',
      fenceToken: '10',
      text: 'external: webhook',
      context: { classification: 'external' }
    });
    await atc.isolationEngine.finalize(task.taskId, 'ADMIN');

    const gov = await atc.governanceEngine.propose({ adminId: 'admin1', action: 'TOGGLE_STOP', params: { enable: true }, reason: 'TEST' });
    await atc.governanceEngine.approve({ adminId: 'admin1', proposalId: gov.proposalId });

    const NewIsolation = require('../../src/core/isolation/IsolationPolicyEngine');
    const NewGov = require('../../src/core/governance/GovernanceEngine');

    const atc2 = {
      state: {
        shards: {
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
        }
      },
      emitState() {},
      getShardIds: () => ['RG-0'],
      _syncLegacyStateFromShard: () => {},
    };
    atc2.isolationEngine = new NewIsolation(atc2);
    atc2.governanceEngine = new NewGov(atc2);

    await db.replayToHazelcast(atc2);

    expect(atc2.state.shards['RG-0'].holder).toBe('agent-1');
    expect(atc2.isolationEngine.tasks.get(task.taskId)?.status).toBe('EXECUTED');
    const pub = atc2.governanceEngine.getPublicState();
    expect(pub.proposals.some(p => p.id === gov.proposalId)).toBe(true);
  });
});
