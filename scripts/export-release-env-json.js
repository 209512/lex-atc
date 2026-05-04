const { spawnSync } = require('child_process');

const parseCommandSpec = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (!s.startsWith('[')) throw new Error('Command spec must be a JSON array');
  const parsed = JSON.parse(s);
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Command spec must be a non-empty JSON array');
  const args = parsed.map(v => String(v));
  if (!args[0]) throw new Error('Command spec must include an executable');
  return { exec: args[0], args: args.slice(1) };
};

const runJsonCommand = ({ spec, envName, timeoutMs = 15000 }) => {
  if (!spec) return null;
  const res = spawnSync(spec.exec, spec.args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1024 * 1024 });
  if (res.status !== 0) {
    process.stderr.write(String(res.stderr || `${envName} failed (exit=${res.status})`));
    process.exit(1);
  }
  return String(res.stdout || '').trim();
};

const safePick = (obj, keys) => {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
};

const pick = (env, keys) => {
  const out = {};
  for (const k of keys) {
    if (env[k] !== undefined) out[k] = env[k];
  }
  return out;
};

const keys = [
  'NODE_ENV',
  'CORS_ALLOWED_ORIGINS',
  'CONTRACT_MODE',
  'CSRF_ENFORCE_ALL_UNSAFE',
  'ADMIN_TOKEN_SECRET_PRESENT'
];

const truthy = (v) => {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v || '').toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
};

const validateNormalized = (raw) => {
  if (!raw || typeof raw !== 'object') {
    process.stderr.write('release-env json must be an object');
    process.exit(1);
  }
  const required = ['NODE_ENV', 'CORS_ALLOWED_ORIGINS', 'CONTRACT_MODE', 'CSRF_ENFORCE_ALL_UNSAFE', 'ADMIN_TOKEN_SECRET_PRESENT'];
  for (const k of required) {
    if (!(k in raw)) {
      process.stderr.write(`release-env json missing key: ${k}`);
      process.exit(1);
    }
  }
  if ('ADMIN_TOKEN_SECRET' in raw) {
    process.stderr.write('release-env json must not include ADMIN_TOKEN_SECRET');
    process.exit(1);
  }
  return {
    ...safePick(raw, keys),
    ADMIN_TOKEN_SECRET_PRESENT: truthy(raw.ADMIN_TOKEN_SECRET_PRESENT) ? 'true' : 'false',
  };
};

const normalize = (obj) => {
  const raw = obj || {};
  const present =
    raw.ADMIN_TOKEN_SECRET_PRESENT === true ||
    String(raw.ADMIN_TOKEN_SECRET_PRESENT || '').toLowerCase() === 'true' ||
    Boolean(raw.ADMIN_TOKEN_SECRET && String(raw.ADMIN_TOKEN_SECRET).length > 0);
  return {
    NODE_ENV: raw.NODE_ENV,
    CORS_ALLOWED_ORIGINS: raw.CORS_ALLOWED_ORIGINS,
    CONTRACT_MODE: raw.CONTRACT_MODE,
    CSRF_ENFORCE_ALL_UNSAFE: raw.CSRF_ENFORCE_ALL_UNSAFE,
    ADMIN_TOKEN_SECRET_PRESENT: present ? 'true' : 'false',
  };
};

const requireCmdOnly = String(process.env.REQUIRE_RELEASE_ENV_CMD || '').toLowerCase() === 'true';
const enforceNormalizeJq = !('ENFORCE_NORMALIZE_JQ' in process.env) || String(process.env.ENFORCE_NORMALIZE_JQ || '').toLowerCase() === 'true';

const inlineJson = process.env.RELEASE_ENV_JSON;
if (inlineJson && String(inlineJson).trim().startsWith('{')) {
  try {
    const parsed = JSON.parse(String(inlineJson));
    const out = requireCmdOnly ? validateNormalized(parsed) : safePick(normalize(parsed), keys);
    process.stdout.write(JSON.stringify(out));
  } catch {
    process.stderr.write('RELEASE_ENV_JSON is not valid JSON');
    process.exit(1);
  }
  process.exit(0);
}

const cmd = process.env.RELEASE_ENV_CMD;
if (cmd && String(cmd).trim().length > 0) {
  if (requireCmdOnly && enforceNormalizeJq && !String(cmd).includes('scripts/release-env/normalize.jq')) {
    process.stderr.write('RELEASE_ENV_CMD must include scripts/release-env/normalize.jq when REQUIRE_RELEASE_ENV_CMD=true');
    process.exit(1);
  }
  let stdout;
  try {
    stdout = runJsonCommand({ spec: parseCommandSpec(cmd), envName: 'RELEASE_ENV_CMD' });
  } catch (e) {
    process.stderr.write(String(e?.message || 'RELEASE_ENV_CMD failed'));
    process.exit(1);
  }
  try {
    const parsed = JSON.parse(String(stdout || '').trim());
    const out = requireCmdOnly ? validateNormalized(parsed) : safePick(normalize(parsed), keys);
    process.stdout.write(JSON.stringify(out));
  } catch {
    process.stderr.write('RELEASE_ENV_CMD must output JSON');
    process.exit(1);
  }
  process.exit(0);
}

if (requireCmdOnly) {
  process.stderr.write('RELEASE_ENV_CMD is required when REQUIRE_RELEASE_ENV_CMD=true');
  process.exit(1);
}

process.stdout.write(JSON.stringify(safePick(normalize(pick(process.env, [
  'NODE_ENV',
  'CORS_ALLOWED_ORIGINS',
  'ADMIN_TOKEN_SECRET',
  'CONTRACT_MODE',
  'CSRF_ENFORCE_ALL_UNSAFE',
  'ADMIN_TOKEN_SECRET_PRESENT'
])), keys)));
