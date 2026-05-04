const request = require('supertest');

describe('governance settlement dispute (backend mode contract)', () => {
  let app;
  let atcService;
  let db;

  beforeAll(async () => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.DB_MODE = 'memory';
    process.env.ADMIN_AUTH_DISABLED = 'true';
    process.env.ALLOW_INSECURE_ADMIN_AUTH = 'true';
    process.env.SOLANA_SETTLEMENT_ENABLED = 'false';
    delete process.env.ALLOW_DEV_AUTH_FALLBACK;
    delete process.env.ALLOW_DEV_SEED_FALLBACK;

    atcService = require('../../src/services/atc.service');
    db = require('../../src/core/DatabaseManager');
    await atcService.init(1);
    atcService.isReady = true;

    const mod = require('../..');
    const { loadBackendConfig } = require('../../src/config/env');
    app = mod.buildApp(atcService, loadBackendConfig({ ...process.env, NODE_ENV: 'test', ADMIN_AUTH_DISABLED: 'true', ALLOW_INSECURE_ADMIN_AUTH: 'true' }));
  });

  afterAll(async () => {
    if (atcService && typeof atcService.shutdown === 'function') {
      await atcService.shutdown();
    }
    if (db && typeof db.stop === 'function') {
      db.stop();
    }
  });

  test('Governance propose auto-executes and records dispute failure when Solana disabled', async () => {
    const res = await request(app)
      .post('/api/settlement/disputes')
      .send({ channelId: 'channel:agent-1', openedBy: 'TEST_ADMIN', targetNonce: 10, reason: 'TEST' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('proposalId');
    expect(res.body).toHaveProperty('status', 'FAILED');
    expect(res.body).toHaveProperty('success', false);

    const proposalId = res.body.proposalId;
    const proposals = await request(app).get('/api/governance/proposals');
    expect(proposals.status).toBe(200);
    const p = proposals.body?.proposals?.find((x) => x.id === proposalId);
    expect(p).toBeTruthy();
    expect(p.status).toBe('FAILED');

    const events = await db.loadEventsAfter(-1);
    const actions = events.map((e) => e.action);
    expect(actions).toContain('DISPUTE_OPEN_FAILED');
  });
});
