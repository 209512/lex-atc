const { validate: validateUuid } = require('uuid');
const Agent = require('../core/Agent');

describe('Agent identity', () => {
  test('agent uuid is deterministic and PostgreSQL UUID compatible', () => {
    const eventBus = { getShardIdForAgent: () => 'RG-0' };
    const sharedClient = {};

    const a = new Agent('Agent-1', eventBus, {}, sharedClient);
    const b = new Agent('Agent-1', eventBus, {}, sharedClient);

    expect(validateUuid(a.uuid)).toBe(true);
    expect(a.uuid).toBe(b.uuid);
  });
});
