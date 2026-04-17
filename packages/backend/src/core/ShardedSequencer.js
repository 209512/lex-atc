// src/core/ShardedSequencer.js
const hazelcastManager = require('./HazelcastManager');

const toNumber = (val) => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'bigint') return Number(val);
  if (typeof val?.toNumber === 'function') return val.toNumber();
  if (typeof val?.toString === 'function') return Number(val.toString());
  return Number(val);
};

class ShardedSequencer {
  constructor() {
    this.cp = null;
    this.client = null;
    this.cache = new Map();
  }

  async init(client = null) {
    const hz = client || await hazelcastManager.init();
    if (!hz) throw new Error('Hazelcast client not initialized');
    this.client = hz;
    this.cp = hz.getCPSubsystem();
  }

  async _atomicLong(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    if (!this.cp) throw new Error('CP Subsystem not initialized');
    const al = await this.cp.getAtomicLong(name);
    this.cache.set(name, al);
    return al;
  }

  _names(shardId) {
    const shard = String(shardId);
    return {
      globalSeq: 'lex:seq:global',
      shardSeq: `lex:seq:${shard}`,
      epoch: `lex:epoch:${shard}`,
      ticketIssuer: `lex:ticket:issuer:${shard}`,
      ticketServing: `lex:ticket:serving:${shard}`,
      bidMap: `lex:bids:${shard}`
    };
  }

  async nextGlobalSeq() {
    const al = await this._atomicLong(this._names('global').globalSeq);
    const v = await al.getAndIncrement();
    return toNumber(v);
  }

  async nextShardSeq(shardId) {
    const al = await this._atomicLong(this._names(shardId).shardSeq);
    const v = await al.getAndIncrement();
    return toNumber(v);
  }

  async getEpoch(shardId) {
    const al = await this._atomicLong(this._names(shardId).epoch);
    const v = await al.get();
    return toNumber(v);
  }

  async bumpEpoch(shardId) {
    const name = this._names(shardId).epoch;
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const al = await this._atomicLong(name);
        const v = await al.incrementAndGet();
        return toNumber(v);
      } catch (e) {
        lastErr = e;
        this.cache.delete(name);
        if (this.client && typeof this.client.getCPSubsystem === 'function') {
          try { this.cp = this.client.getCPSubsystem(); } catch {}
        }
        await new Promise(r => setTimeout(r, 10 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  // async issueTicket(shardId) {
  //   const issuer = await this._atomicLong(this._names(shardId).ticketIssuer);
  //   const v = await issuer.getAndIncrement();
  //   return toNumber(v);
  // }
  async issueTicket(shardId, agentUuid, bidAmount = 0) {
    if (!this.client) await this.init();
    const names = this._names(shardId);
    const issuer = await this._atomicLong(names.ticketIssuer);
    let ticket = toNumber(await issuer.getAndIncrement());
    
    // Circular Queue Logic: Prevent JS Number.MAX_SAFE_INTEGER overflow
    if (ticket >= Number.MAX_SAFE_INTEGER - 100000) {
        await issuer.set(0);
        const serving = await this._atomicLong(names.ticketServing);
        await serving.set(0);
        ticket = 0;
    }

    const bidMap = await this.client.getMap(names.bidMap);
    await bidMap.put(ticket, { uuid: agentUuid, bid: bidAmount, timestamp: Date.now() });

    return ticket;
  }

  async getServingTicket(shardId) {
    const serving = await this._atomicLong(this._names(shardId).ticketServing);
    const v = await serving.get();
    return toNumber(v);
  }

  async advanceServingTicket(shardId) {
    const serving = await this._atomicLong(this._names(shardId).ticketServing);
    const v = await serving.incrementAndGet();
    return toNumber(v);
  }
  
  async getHighestBidder(shardId) {
    if (!this.client) await this.init();
    const bidMap = await this.client.getMap(this._names(shardId).bidMap);
    const entries = await bidMap.entrySet();
    if (entries.length === 0) return null;
    return entries.sort((a, b) => b[1].bid - a[1].bid || a[0] - b[0])[0];
  }
}

module.exports = ShardedSequencer;
