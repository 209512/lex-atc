const { SseEventSchema } = require('@lex-atc/shared');
const atcService = require('../../src/services/atc.service');

describe('SSE Schema Contract', () => {
  beforeAll(async () => {
    await atcService.init();
  });

  afterAll(async () => {
    await atcService.shutdown();
  });

  test('backend SSE payload conforms to shared Zod schema', async () => {
    await atcService.agentManager.updateAgentPool(1);
    
    const agents = await atcService.getAgentStatus();
    const data = {
      state: {
        ...atcService.state,
        contractVersion: 1,
        sse: { serverTime: Date.now() },
        logs: atcService.state.logs || []
      },
      agents: agents
    };

    const result = SseEventSchema.parse(data);
    expect(result.agents.length).toBeGreaterThan(0);
    expect(result.state).toBeDefined();
  });
});
