const fs = require('fs');

const parseEnvFile = (filePath) => {
  if (!filePath) return {};
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const k = trimmed.slice(0, idx).trim();
    let v = trimmed.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
};

const requireJsonArrayCommand = (env, key, problems) => {
  const raw = env[key];
  if (raw === undefined || raw === null || String(raw).trim() === '') return;
  const s = String(raw).trim();
  if (!s.startsWith('[')) {
    problems.push(`${key} must be a JSON array command spec (example: ["node","scripts/foo.js"])`);
    return;
  }
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      problems.push(`${key} must be a non-empty JSON array`);
      return;
    }
    const exec = String(parsed[0] || '').trim();
    if (!exec) problems.push(`${key} first element must be an executable`);
  } catch {
    problems.push(`${key} must be valid JSON`);
  }
};

const checkCommandSpecs = (env) => {
  const problems = [];
  requireJsonArrayCommand(env, 'SECRETS_CMD', problems);
  requireJsonArrayCommand(env, 'RELEASE_ENV_CMD', problems);
  return problems;
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const envFileIdx = args.indexOf('--env-file');
  const envFile = envFileIdx !== -1 ? args[envFileIdx + 1] : null;
  const stdinJson = args.includes('--stdin-json');
  let jsonEnv = {};
  if (stdinJson) {
    try {
      const raw = fs.readFileSync(0, 'utf8');
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') jsonEnv = obj;
    } catch {
      jsonEnv = {};
    }
  }

  const env = { ...parseEnvFile(envFile), ...jsonEnv, ...process.env };
  const problems = checkCommandSpecs(env);
  if (problems.length > 0) {
    process.stderr.write(`check-command-specs failed:\n- ${problems.join('\n- ')}\n`);
    process.exit(1);
  }
  process.stdout.write('check-command-specs ok\n');
}

module.exports = { checkCommandSpecs };
