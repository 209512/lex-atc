class FakeMap {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    return this.store.get(String(key));
  }

  async put(key, value) {
    this.store.set(String(key), value);
  }

  async remove(key) {
    this.store.delete(String(key));
  }

  async entrySet() {
    return Array.from(this.store.entries());
  }
}

class FakeAtomicLong {
  constructor() {
    this.value = 0;
  }

  async get() {
    return this.value;
  }

  async getAndIncrement() {
    const current = this.value;
    this.value += 1;
    return current;
  }

  async incrementAndGet() {
    this.value += 1;
    return this.value;
  }
}

class FakeLock {
  constructor() {
    this.fence = 0;
    this.ownerFence = null;
  }

  async tryLock() {
    if (this.ownerFence !== null) return null;
    this.fence += 1;
    this.ownerFence = this.fence;
    return this.ownerFence;
  }

  async unlock(fenceToken) {
    if (this.ownerFence === null) return;
    if (fenceToken !== undefined && fenceToken !== null && Number(fenceToken) !== Number(this.ownerFence)) return;
    this.ownerFence = null;
  }
}

class FakeCPSubsystem {
  constructor() {
    this.atomicLongs = new Map();
    this.locks = new Map();
  }

  async getAtomicLong(name) {
    const key = String(name);
    if (!this.atomicLongs.has(key)) this.atomicLongs.set(key, new FakeAtomicLong());
    return this.atomicLongs.get(key);
  }

  async getLock(name) {
    const key = String(name);
    if (!this.locks.has(key)) this.locks.set(key, new FakeLock());
    return this.locks.get(key);
  }
}

class FakeHazelcastClient {
  constructor() {
    this.maps = new Map();
    this.cp = new FakeCPSubsystem();
  }

  async getMap(name) {
    const n = String(name);
    if (!this.maps.has(n)) this.maps.set(n, new FakeMap());
    return this.maps.get(n);
  }

  getCPSubsystem() {
    return this.cp;
  }

  getLifecycleService() {
    return null;
  }

  async shutdown() {}
}

const createFakeSequencer = () => {
  let g = 0;
  const shardSeq = new Map();
  const epochs = new Map();
  const tickets = new Map();
  const serving = new Map();

  const nextShard = (sid) => {
    const v = shardSeq.get(sid) ?? 0;
    shardSeq.set(sid, v + 1);
    return v;
  };

  return {
    async nextGlobalSeq() { const v = g; g += 1; return v; },
    async nextShardSeq(shardId) { return nextShard(String(shardId)); },
    async getEpoch(shardId) { return epochs.get(String(shardId)) ?? 0; },
    async bumpEpoch(shardId) {
      const sid = String(shardId);
      const e = (epochs.get(sid) ?? 0) + 1;
      epochs.set(sid, e);
      return e;
    },
    async issueTicket(shardId) {
      const sid = String(shardId);
      const t = tickets.get(sid) ?? 0;
      tickets.set(sid, t + 1);
      if (!serving.has(sid)) serving.set(sid, 0);
      return t;
    },
    async getServingTicket(shardId) { return serving.get(String(shardId)) ?? 0; },
    async advanceServingTicket(shardId) {
      const sid = String(shardId);
      const v = (serving.get(sid) ?? 0) + 1;
      serving.set(sid, v);
      return v;
    },
  };
};

module.exports = { FakeHazelcastClient, FakeMap, createFakeSequencer };
