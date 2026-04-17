describe('AI provider fallback', () => {
  afterEach(() => {
    delete process.env.USE_MOCK_AI;
    delete process.env.OPENAI_API_KEY;
  });

  test('USE_MOCK_AI=true forces mock response even for openai provider', async () => {
    jest.resetModules();
    process.env.USE_MOCK_AI = 'true';
    process.env.OPENAI_API_KEY = 'mock-api-key-123';

    const ProviderFactory = require('./ProviderFactory');
    const provider = ProviderFactory.create('openai', { model: 'gpt-4o-mini' });
    await provider.init();

    const text = await provider.generateResponse('hello', 'system');
    expect(text).toContain('Mock Response');
    expect(text).toContain('USE_MOCK_AI=true');
  });

  test('placeholder api key falls back to mock provider', async () => {
    jest.resetModules();
    process.env.USE_MOCK_AI = 'false';
    process.env.OPENAI_API_KEY = 'mock-api-key-123';

    const ProviderFactory = require('./ProviderFactory');
    const provider = ProviderFactory.create('openai', { model: 'gpt-4o-mini' });
    await provider.init();

    const text = await provider.generateResponse('hello', 'system');
    expect(text).toContain('Mock Response');
  });

  test('401 from openai client returns mock response instead of hard failure', async () => {
    jest.resetModules();
    process.env.USE_MOCK_AI = 'false';

    const OpenAIProvider = require('./OpenAIProvider');
    const provider = new OpenAIProvider({ apiKey: 'mock-valid-looking', model: 'gpt-4o-mini' });
    provider.client = {
      chat: {
        completions: {
          create: async () => {
            const err = new Error('401 Unauthorized');
            err.status = 401;
            throw err;
          }
        }
      }
    };

    const text = await provider.generateResponse('hello', 'system');
    expect(text).toContain('Mock Response');
    expect(text).toContain('api_auth_failure');
  });
});
