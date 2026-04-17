const request = require('supertest');

describe('backend smoke', () => {
  let app;
  let atcService;

  beforeAll(async () => {
    atcService = require('../../src/services/atc.service');
    // Ensure service is marked ready to bypass readiness probe
    await atcService.init(1);
    atcService.isReady = true;
    const mod = require('../..');
    const { loadBackendConfig } = require('../../src/config/env');
    app = mod.buildApp(atcService, loadBackendConfig({ ...process.env, NODE_ENV: 'test', ADMIN_AUTH_DISABLED: 'true' }));
  });

  afterAll(async () => {
    if (atcService && typeof atcService.shutdown === 'function') {
        await atcService.shutdown();
    }
  });
  test('GET /api/agents/status returns json array', async () => {
    const res = await request(app).get('/api/agents/status');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/stop toggles globalStop', async () => {
    const res = await request(app)
      .post('/api/stop')
      .send({ enable: true })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('scheduled', true);
    expect(res.body).toHaveProperty('proposalId');
  });

  test('POST /api/override responds success', async () => {
    const res = await request(app).post('/api/override');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('scheduled', true);
  });
});
