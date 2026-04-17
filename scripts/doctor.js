const { execSync } = require('child_process');

const DOCTOR_URL = process.env.DOCTOR_URL || 'http://localhost:3000/api/doctor';

const tryExec = (cmd) => {
  try {
    return { ok: true, out: execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PAGER: 'cat' } }).toString() };
  } catch (e) {
    return { ok: false, out: (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : ''), code: e.status || 1 };
  }
};

const fmt = (v) => (v === null || v === undefined) ? 'n/a' : String(v);

const main = async () => {
  const docker = tryExec('docker compose ps');
  if (docker.ok) {
    process.stdout.write('\n[docker compose ps]\n');
    process.stdout.write(docker.out.trimEnd() + '\n');
  } else {
    process.stdout.write('\n[docker compose ps] unavailable\n');
  }

  let res;
  try {
    res = await fetch(DOCTOR_URL, { headers: { 'accept': 'application/json' } });
  } catch (e) {
    process.stderr.write(`\n[doctor] failed to fetch ${DOCTOR_URL}: ${e.message}\n`);
    process.exit(2);
  }

  let body = {};
  try {
    body = await res.json();
  } catch {}

  process.stdout.write(`\n[doctor] ${res.status} ${fmt(body.status)}\n`);

  const checks = body.checks || {};
  const lines = [];
  for (const [k, v] of Object.entries(checks)) {
    const ok = v && (v.ok === true || v.status === 'ok' || v.status === 'ready');
    const extra = v && v.details ? ` ${fmt(v.details)}` : '';
    lines.push(`${ok ? 'OK' : 'FAIL'} ${k}${extra}`);
  }
  lines.sort();
  for (const l of lines) process.stdout.write(l + '\n');

  const failed = Number(body.failed || 0);
  if (!res.ok || failed > 0) process.exit(1);
};

main().catch((e) => {
  process.stderr.write(`doctor crashed: ${e.message}\n`);
  process.exit(2);
});

