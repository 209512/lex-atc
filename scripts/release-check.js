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

const args = process.argv.slice(2);
const envFileIdx = args.indexOf('--env-file');
const envFile = envFileIdx !== -1 ? args[envFileIdx + 1] : null;
const fileEnv = parseEnvFile(envFile);
const envJsonIdx = args.indexOf('--env-json');
const envJsonFile = envJsonIdx !== -1 ? args[envJsonIdx + 1] : null;
let jsonEnv = {};
if (envJsonFile) {
  try {
    const raw = fs.readFileSync(envJsonFile, 'utf8');
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') jsonEnv = obj;
  } catch {
    jsonEnv = {};
  }
}

const stdinJson = args.includes('--stdin-json');
if (stdinJson) {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') jsonEnv = { ...jsonEnv, ...obj };
  } catch {
    jsonEnv = jsonEnv;
  }
}

const env = { ...fileEnv, ...jsonEnv, ...process.env };

const problems = [];
const { checkCommandSpecs } = require('./check-command-specs');
problems.push(...checkCommandSpecs(env).map((p) => `command-spec:${p}`));

const requireVar = (k) => {
  if (!env[k]) problems.push(`missing:${k}`);
};

const isTruthy = (v) => {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v || '').toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
};

const forbidVar = (k) => {
  if (env[k] !== undefined && String(env[k]).length > 0) problems.push(`forbidden:${k}`);
};

const nodeEnv = String(env.NODE_ENV || '');
const shouldValidate = Boolean(envFile) || Boolean(envJsonFile) || stdinJson || nodeEnv === 'production';
if (!shouldValidate) {
  process.stdout.write('release-check skipped (set NODE_ENV=production or provide --env-file/--env-json/--stdin-json)\n');
  process.exit(0);
}

if (nodeEnv !== 'production') problems.push('NODE_ENV must be production');

requireVar('CORS_ALLOWED_ORIGINS');
if (!isTruthy(env.ADMIN_TOKEN_SECRET_PRESENT)) {
  requireVar('ADMIN_TOKEN_SECRET');
}

forbidVar('ADMIN_AUTH_DISABLED');
forbidVar('ALLOW_DEV_AUTH_FALLBACK');
forbidVar('ALLOW_DEV_SEED_FALLBACK');

const contractMode = String(env.CONTRACT_MODE || 'warn').toLowerCase();
if (!['warn', 'enforce'].includes(contractMode)) problems.push('CONTRACT_MODE must be warn|enforce');

if (String(env.CSRF_ENFORCE_ALL_UNSAFE || '').toLowerCase() === 'true') {
  requireVar('CORS_ALLOWED_ORIGINS');
}

if (problems.length > 0) {
  process.stderr.write(`release-check failed:\n- ${problems.join('\n- ')}\n`);
  process.exit(1);
}

process.stdout.write('release-check ok\n');
