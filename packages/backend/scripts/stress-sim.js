const { simulate } = require('../src/stress/simulate');
const logger = require('../src/utils/logger');

const main = async () => {
  const agentCount = Number(process.env.STRESS_AGENTS || 50);
  const iterations = Number(process.env.STRESS_ITERS || 2000);
  const shardCount = Number(process.env.STRESS_SHARDS || 4);
  const seed = Number(process.env.STRESS_SEED || 1);

  const started = Date.now();
  const res = await simulate({ agentCount, iterations, shardCount, seed });
  const ms = Date.now() - started;
  const eps = Math.round((res.events / Math.max(1, ms)) * 1000);

  process.stdout.write(
    JSON.stringify({
      ok: true,
      durationMs: ms,
      events: res.events,
      eventsPerSec: eps,
      agents: res.agents,
      shards: res.shards,
      namespace: res.namespace
    }, null, 2) + '\n'
  );
};

main().catch((e) => {
  logger.error(e);
  process.exit(1);
});

