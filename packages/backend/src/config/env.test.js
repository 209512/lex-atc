describe('env config validation', () => {
  test('production requires admin token secret and CORS allowed origins', () => {
    jest.resetModules();
    const { loadBackendConfig } = require('./env');

    expect(() => loadBackendConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://testuser:testpass@localhost:5432/testdb'
    })).toThrow(/ADMIN_TOKEN_SECRET/);
  });

  test('production db mode pg requires DB connection env', () => {
    jest.resetModules();
    const { loadBackendConfig } = require('./env');

    expect(() => loadBackendConfig({
      NODE_ENV: 'production',
      ADMIN_TOKEN_SECRET: 'some-secret-key-12345',
      CORS_ALLOWED_ORIGINS: 'https://example.com',
      DB_MODE: 'pg'
    })).toThrow(/DATABASE_URL/);
  });

  test('development allows missing secrets and uses defaults', () => {
    jest.resetModules();
    const { loadBackendConfig } = require('./env');
    const cfg = loadBackendConfig({ NODE_ENV: 'development' });
    expect(cfg.server.port).toBe(3000);
    expect(cfg.rateLimit.global.limit).toBe(240);
  });
});

