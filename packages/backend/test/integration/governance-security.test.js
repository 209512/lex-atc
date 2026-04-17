const request = require('supertest');
const jwt = require('jsonwebtoken');

const makeToken = (secret, payload) => {
  return jwt.sign(payload, secret, { algorithm: 'HS256' });
};

describe('Admin security & governance', () => {
  test('ADMIN_AUTH_DISABLED=true bypasses admin auth for local control flows', async () => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.ADMIN_AUTH_DISABLED = 'true';
    delete process.env.ADMIN_TOKEN_SECRET;
    let overrideCalled = 0;

    const { buildApp } = require('../../index');
    const GovernanceEngine = require('../../src/core/governance/GovernanceEngine');
    const JobQueue = require('../../src/core/queue/JobQueue');
    JobQueue.registerQueue('audit-queue', async (job) => {
        if (global.testSvc) {
            if (job.name.startsWith('econ:')) await global.testSvc.recordEconomicEvent(null, job.data.params);
            else await global.testSvc.recordEvent(job.data);
        }
    });
                const svc = {
      isReady: true,
      state: { shards: { 'RG-0': { epoch: 0, resourceId: 'r' } } },
      recordEvent: async () => ({ inserted: true }),
      emitState: () => {},
      humanOverride: async () => { overrideCalled += 1; return { success: true }; },
      releaseHumanLock: async () => ({ success: true }),
      transferLock: async () => ({ success: true }),
      pauseAgent: async () => ({ success: true }),
      terminateAgent: async () => ({ success: true }),
      toggleGlobalStop: async () => ({ success: true }),
      updateAgentPool: async () => ({ success: true }),
      registerAgentConfig: async () => ({ success: true }),
      settlementEngine: { openDispute: async () => ({ ok: true }), slash: async () => ({ ok: true }) },
      agentConfigs: new Map(),
      listIsolationTasks: () => ({ pending: [] }),
      getAgentStatus: async () => ([]),
      renameAgent: async () => true,
      togglePriority: async () => true,
      updatePriorityOrder: async () => true,
    };
    global.testSvc = svc;
    
    svc.governanceEngine = new GovernanceEngine(svc);
    const app = buildApp(svc);

    const res = await request(app).post('/api/override').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.autoExecuted).toBe(true);
    expect(overrideCalled).toBe(1);
  });

  test('Unauthorized request is rejected', async () => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.ADMIN_AUTH_DISABLED = 'false';
    process.env.ADMIN_TOKEN_SECRET = 'secret-test';

    const { buildApp } = require('../../index');
    const GovernanceEngine = require('../../src/core/governance/GovernanceEngine');
    const JobQueue = require('../../src/core/queue/JobQueue');
    JobQueue.registerQueue('audit-queue', async (job) => {
        if (global.testSvc) {
            if (job.name.startsWith('econ:')) await global.testSvc.recordEconomicEvent(null, job.data.params);
            else await global.testSvc.recordEvent(job.data);
        }
    });
        const svc = {
      isReady: true,
      state: { shards: { 'RG-0': { epoch: 0, resourceId: 'r' } } },
      recordEvent: async () => ({ inserted: true }),
      emitState: () => {},
      humanOverride: async () => ({ success: true }),
      releaseHumanLock: async () => ({ success: true }),
      transferLock: async () => ({ success: true }),
      pauseAgent: async () => ({ success: true }),
      terminateAgent: async () => ({ success: true }),
      toggleGlobalStop: async () => ({ success: true }),
      updateAgentPool: async () => ({ success: true }),
      registerAgentConfig: async () => ({ success: true }),
      settlementEngine: { openDispute: async () => ({ ok: true }), slash: async () => ({ ok: true }) },
      agentConfigs: new Map(),
      listIsolationTasks: () => ({ pending: [] }),
      getAgentStatus: async () => ([]),
      renameAgent: async () => true,
      togglePriority: async () => true,
      updatePriorityOrder: async () => true,
    };
    global.testSvc = svc;
    svc.governanceEngine = new GovernanceEngine(svc);
    const app = buildApp(svc);

    const res = await request(app).post('/api/override').send({});
    expect(res.status).toBe(401);
  });

  test('Malformed request is rejected by validation', async () => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.ADMIN_AUTH_DISABLED = 'false';
    process.env.ADMIN_TOKEN_SECRET = 'secret-test';
    process.env.GOVERNANCE_TIMELOCK_MS = '0';
    process.env.GOVERNANCE_APPROVAL_THRESHOLD = '1';
    process.env.GOVERNANCE_APPROVAL_TOTAL = '1';

    const secret = process.env.ADMIN_TOKEN_SECRET;
    const token = makeToken(secret, { sub: 'admin1', roles: ['governor', 'executor'] });

    const { buildApp } = require('../../index');
    const GovernanceEngine = require('../../src/core/governance/GovernanceEngine');
    const JobQueue = require('../../src/core/queue/JobQueue');
    JobQueue.registerQueue('audit-queue', async (job) => {
        if (global.testSvc) {
            if (job.name.startsWith('econ:')) await global.testSvc.recordEconomicEvent(null, job.data.params);
            else await global.testSvc.recordEvent(job.data);
        }
    });
        const svc = {
      isReady: true,
      state: { shards: { 'RG-0': { epoch: 0, resourceId: 'r' } } },
      recordEvent: async () => ({ inserted: true }),
      emitState: () => {},
      humanOverride: async () => ({ success: true }),
      releaseHumanLock: async () => ({ success: true }),
      transferLock: async () => ({ success: true }),
      pauseAgent: async () => ({ success: true }),
      terminateAgent: async () => ({ success: true }),
      toggleGlobalStop: async () => ({ success: true }),
      updateAgentPool: async () => ({ success: true }),
      registerAgentConfig: async () => ({ success: true }),
      settlementEngine: { openDispute: async () => ({ ok: true }), slash: async () => ({ ok: true }) },
      agentConfigs: new Map(),
      listIsolationTasks: () => ({ pending: [] }),
      getAgentStatus: async () => ([]),
      renameAgent: async () => true,
      togglePriority: async () => true,
      updatePriorityOrder: async () => true,
    };
    global.testSvc = svc;
    svc.governanceEngine = new GovernanceEngine(svc);
    const app = buildApp(svc);

    const res = await request(app)
      .post('/api/stop')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('Timelock pending -> executed and audit events recorded', async () => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.ADMIN_AUTH_DISABLED = 'false';
    process.env.ADMIN_TOKEN_SECRET = 'secret-test';
    process.env.GOVERNANCE_TIMELOCK_MS = '0';
    process.env.GOVERNANCE_APPROVAL_THRESHOLD = '1';
    process.env.GOVERNANCE_APPROVAL_TOTAL = '1';

    const secret = process.env.ADMIN_TOKEN_SECRET;
    const token = makeToken(secret, { sub: 'admin1', roles: ['governor', 'executor'] });

    const events = [];
    let overrideCalled = 0;

    const { buildApp } = require('../../index');
    const GovernanceEngine = require('../../src/core/governance/GovernanceEngine');
    const JobQueue = require('../../src/core/queue/JobQueue');
    JobQueue.registerQueue('audit-queue', async (job) => {
        if (global.testSvc) {
            if (job.name.startsWith('econ:')) await global.testSvc.recordEconomicEvent(null, job.data.params);
            else await global.testSvc.recordEvent(job.data);
        }
    });
        const svc = {
      isReady: true,
      state: { shards: { 'RG-0': { epoch: 0, resourceId: 'r' } } },
      recordEvent: async ({ action }) => { events.push(action); return { inserted: true }; },
      emitState: () => {},
      humanOverride: async () => { overrideCalled += 1; return { success: true }; },
      releaseHumanLock: async () => ({ success: true }),
      transferLock: async () => ({ success: true }),
      pauseAgent: async () => ({ success: true }),
      terminateAgent: async () => ({ success: true }),
      toggleGlobalStop: async () => ({ success: true }),
      updateAgentPool: async () => ({ success: true }),
      registerAgentConfig: async () => ({ success: true }),
      settlementEngine: { openDispute: async () => ({ ok: true }), slash: async () => ({ ok: true }) },
      agentConfigs: new Map(),
      listIsolationTasks: () => ({ pending: [] }),
      getAgentStatus: async () => ([]),
      renameAgent: async () => true,
      togglePriority: async () => true,
      updatePriorityOrder: async () => true,
    };
    global.testSvc = svc;
    svc.governanceEngine = new GovernanceEngine(svc);
    const app = buildApp(svc);

    const propose = await request(app)
      .post('/api/override')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(propose.status).toBe(200);
    expect(propose.body.scheduled).toBe(true);
    expect(propose.body.proposalId).toBeTruthy();

    const proposalId = propose.body.proposalId;

    const approve = await request(app)
      .post(`/api/governance/proposals/${proposalId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(approve.status).toBe(200);
    expect(approve.body.success).toBe(true);

    const exec = await request(app)
      .post(`/api/governance/proposals/${proposalId}/execute`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(exec.status).toBe(200);
    expect(exec.body.success).toBe(true);
    expect(overrideCalled).toBe(1);

    expect(events).toContain('GOV_PROPOSAL_CREATED');
    expect(events).toContain('GOV_APPROVED');
    expect(events).toContain('GOV_READY');
    expect(events).toContain('GOV_EXECUTED');
  });
});
