const ShardedSequencer = require('../../src/core/ShardedSequencer');

const createAtomicLong = (initial = 0) => {
  let v = initial;
  return {
    async incrementAndGet() { v += 1; return v; },
    async getAndIncrement() { const old = v; v += 1; return old; },
    async get() { return v; },
    async set(next) { v = next; },
  };
};

const createCpSubsystem = () => {
  const store = new Map();
  return {
    async getAtomicLong(name) {
      if (!store.has(name)) store.set(name, createAtomicLong(0));
      return store.get(name);
    },
  };
};

const createMap = () => {
  const store = new Map();
  return {
    async put(key, value) { store.set(key, value); },
    async entrySet() { return Array.from(store.entries()); },
  };
};

const createClient = () => {
  const cp = createCpSubsystem();
  const maps = new Map();
  return {
    getCPSubsystem: () => cp,
    async getMap(name) {
      if (!maps.has(name)) maps.set(name, createMap());
      return maps.get(name);
    },
  };
};

describe('ShardedSequencer', () => {
  test('global sequence increments monotonically', async () => {
    const seq = new ShardedSequencer();
    await seq.init(createClient());

    const a = await seq.nextGlobalSeq();
    const b = await seq.nextGlobalSeq();
    expect(a).toBe(0);
    expect(b).toBe(1);
  });

  test('shard sequences are independent', async () => {
    const seq = new ShardedSequencer();
    await seq.init(createClient());

    const s0a = await seq.nextShardSeq('RG-0');
    const s1a = await seq.nextShardSeq('RG-1');
    const s0b = await seq.nextShardSeq('RG-0');

    expect(s0a).toBe(0);
    expect(s1a).toBe(0);
    expect(s0b).toBe(1);
  });

  test('epoch bumps and tickets advance correctly', async () => {
    const seq = new ShardedSequencer();
    await seq.init(createClient());

    const e0 = await seq.getEpoch('RG-0');
    expect(e0).toBe(0);
    const e1 = await seq.bumpEpoch('RG-0');
    expect(e1).toBe(1);

    const t0 = await seq.issueTicket('RG-0');
    const t1 = await seq.issueTicket('RG-0');
    expect(t0).toBe(0);
    expect(t1).toBe(1);

    const serving0 = await seq.getServingTicket('RG-0');
    expect(serving0).toBe(0);
    const serving1 = await seq.advanceServingTicket('RG-0');
    expect(serving1).toBe(1);
  });

  test('highest bidder is selected from shard bid map', async () => {
    const seq = new ShardedSequencer();
    await seq.init(createClient());

    await seq.issueTicket('RG-0', 'agent-a', 0.1);
    await seq.issueTicket('RG-0', 'agent-b', 0.4);
    await seq.issueTicket('RG-0', 'agent-c', 0.2);

    const highest = await seq.getHighestBidder('RG-0');
    expect(highest[1].uuid).toBe('agent-b');
    expect(highest[1].bid).toBe(0.4);
  });
});
