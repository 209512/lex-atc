process.env.MOCK_AI_DELAY = '0';
process.env.AGENT_MIN_TASK_TIME = '0';
process.env.AGENT_PAUSE_DELAY = '0';
process.env.AGENT_ESCROW_DELAY = '0';
process.env.AGENT_NO_SHARD_DELAY = '0';
process.env.AGENT_TAKEOVER_DELAY = '0';
process.env.AGENT_WAITING_DELAY = '0';
process.env.AGENT_QUEUE_DELAY = '0';
process.env.AGENT_ERROR_DELAY = '0';
process.env.AGENT_AI_TIMEOUT = '12000';
process.env.AGENT_SLASHED_DELAY = '0';
process.env.ALLOW_TEST_DUMMY_KEYS = 'true';

process.env.REDIS_URL = '';
process.env.REDIS_SENTINELS = '';
process.env.USE_LOCAL_HZ = 'true';
process.env.QUIET_SETTLEMENT_TEST_LOGS = 'true';

afterEach(async () => {
  try {
    const instances = globalThis.__LEX_ATC_ATC_INSTANCES__;
    if (instances && typeof instances.forEach === 'function') {
      const list = [];
      instances.forEach(i => list.push(i));
      for (const atc of list) {
        if (atc && atc._stateEmitInterval) {
          clearInterval(atc._stateEmitInterval);
          atc._stateEmitInterval = null;
        }
        if (atc?.governanceEngine?.stop) atc.governanceEngine.stop();
        if (atc?.settlementEngine?.stop) atc.settlementEngine.stop();
        if (atc?.isolationEngine?.stop) atc.isolationEngine.stop();
        if (atc?.sharedClient?.shutdown) await atc.sharedClient.shutdown();
        instances.delete(atc);
      }
    }
  } catch {}

  try {
    const db = require('../src/core/DatabaseManager');
    if (db?.postgresAdapter?.pool && typeof db.postgresAdapter.pool.end !== 'function') {
      db.postgresAdapter.pool = null;
    }
    if (db && typeof db.stop === 'function') {
      db.stop();
    }
  } catch {}
});
