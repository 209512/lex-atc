const { simulate } = require('../src/stress/simulate');

const main = async () => {
  const agentCount = Number(process.env.STRESS_AGENTS || 50);
  const iterations = Number(process.env.STRESS_ITERS || 2000);
  const shardCount = Number(process.env.STRESS_SHARDS || 4);
  const seed = Number(process.env.STRESS_SEED || 1);

  const cpuBefore = process.cpuUsage();
  const ruBefore = process.resourceUsage ? process.resourceUsage() : null;
  const started = Date.now();

  const res = await simulate({ agentCount, iterations, shardCount, seed });

  const durationMs = Date.now() - started;
  const cpuAfter = process.cpuUsage(cpuBefore);
  const ruAfter = process.resourceUsage ? process.resourceUsage() : null;
  const eps = Math.round((res.events / Math.max(1, durationMs)) * 1000);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        durationMs,
        events: res.events,
        eventsPerSec: eps,
        agents: res.agents,
        shards: res.shards,
        namespace: res.namespace,
        cpu: {
          userMs: Math.round(cpuAfter.user / 1000),
          systemMs: Math.round(cpuAfter.system / 1000),
        },
        resource: ruAfter && ruBefore
          ? {
              maxRssKb: ruAfter.maxRSS,
              fsRead: ruAfter.fsRead,
              fsWrite: ruAfter.fsWrite,
              voluntaryContextSwitches: ruAfter.voluntaryContextSwitches,
              involuntaryContextSwitches: ruAfter.involuntaryContextSwitches,
            }
          : null,
      },
      null,
      2,
    ) + '\n',
  );
};

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e));
  process.stderr.write('\n');
  process.exit(1);
});

