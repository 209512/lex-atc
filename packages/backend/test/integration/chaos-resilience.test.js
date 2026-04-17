const { FakeHazelcastClient, createFakeSequencer } = require('../helpers/FakeHazelcast');
const { SYSTEM } = require('@lex-atc/shared');

describe('Chaos & Resilience: Hazelcast node crashes and Split-Brain recovery', () => {
  const flush = () => new Promise((r) => setImmediate(r));

  const setup = async () => {
    jest.resetModules();
    process.env.DB_MODE = 'memory';
    process.env.DB_MEMORY_NAMESPACE = `chaos-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    
    const db = require('../../src/core/DatabaseManager');
    await db.init();

    const atc = require('../../src/services/atc.service');
    const logs = [];
    atc.addLog = (_agentId, message, type) => { logs.push({ message, type }); };
    atc.sequencer = createFakeSequencer();
    atc.sharedClient = new FakeHazelcastClient();

    atc.state.shards = {
      'RG-0': {
        shardId: 'RG-0',
        epoch: 0,
        resourceId: 'traffic-control-lock:RG-0:e0',
        holder: null,
        fencingToken: null,
        forcedCandidate: null,
        waitingAgents: [],
        lease: null,
        lastEscalationStep: -1,
      }
    };
    
    if (!atc._syncLegacyStateFromShard) {
      atc._syncLegacyStateFromShard = (shardId) => {
        const shard = atc.state.shards[shardId];
        if (shard) {
          atc.state.resourceId = shard.resourceId;
          atc.state.holder = shard.holder;
          atc.state.fencingToken = shard.fencingToken;
        }
      };
    }
    
    if (!atc._bumpEpoch) {
      atc._bumpEpoch = async (shardId, reason, forcedCandidate = null) => {
         const shard = atc.state.shards[shardId];
         if (shard) {
             shard.epoch += 1;
             shard.resourceId = `traffic-control-lock:${shardId}:e${shard.epoch}`;
             shard.holder = null;
             shard.fencingToken = null;
             shard.forcedCandidate = forcedCandidate;
             atc._syncLegacyStateFromShard(shardId);
         }
      };
    }

    atc._syncLegacyStateFromShard('RG-0');

    return { atc, db, logs };
  };

  test('Hazelcast node crash: getAgentStatus gracefully handles disconnection', async () => {
    const { atc } = await setup();
    
    atc.sharedClient.getMap = async () => {
      throw new Error('Hazelcast client disconnected!');
    };

    const status = await atc.getAgentStatus();
    expect(status).toEqual([]);
  });

  test('Hazelcast node crash: isAgentPaused gracefully handles disconnection', async () => {
    const { atc } = await setup();
    
    atc.sharedClient.getMap = async () => {
      throw new Error('Hazelcast client disconnected!');
    };

    const paused = await atc.isAgentPaused('agent-1');
    expect(paused).toBe(false);
  });

  test('Split-Brain: detects agent lock collisions and updates state', async () => {
    const { atc, logs } = await setup();

    const initialCollisions = atc.state.collisionCount;

    atc.handleAgentCollision();
    
    await flush();

    expect(atc.state.collisionCount).toBe(initialCollisions + 1);
    expect(logs).toContainEqual(expect.objectContaining({
      message: '⚠️ Collision detected!',
      type: 'warn'
    }));
  });

  test('Split-Brain recovery: detects priority contention and logs policy', async () => {
    const { atc, logs } = await setup();

    const initialCollisions = atc.state.collisionCount;

    atc.handlePriorityCollision();
    
    await flush();

    expect(atc.state.collisionCount).toBe(initialCollisions + 1);
    expect(atc.state.priorityCollisionTrigger).toBeDefined();
    expect(logs).toContainEqual(expect.objectContaining({
      message: '🚨 Priority Contention',
      type: 'policy'
    }));
  });
});