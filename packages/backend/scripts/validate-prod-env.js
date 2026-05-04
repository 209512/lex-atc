const forbiddenInProd = [
  'ADMIN_AUTH_DISABLED',
  'ALLOW_DEV_AUTH_FALLBACK',
  'ALLOW_DEV_SEED_FALLBACK',
];

const requireJsonArrayCommand = (key) => {
  const raw = process.env[key];
  if (raw === undefined || raw === null || String(raw).trim() === '') return;
  const s = String(raw).trim();
  if (!s.startsWith('[')) {
    console.error(`[validate-prod-env] ${key} must be a JSON array command spec`);
    process.exit(2);
  }
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed) || parsed.length === 0 || !String(parsed[0] || '').trim()) {
      console.error(`[validate-prod-env] ${key} must be a non-empty JSON array starting with an executable`);
      process.exit(2);
    }
  } catch {
    console.error(`[validate-prod-env] ${key} must be valid JSON`);
    process.exit(2);
  }
};

const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();

if (nodeEnv === 'production') {
  for (const k of forbiddenInProd) {
    if (Object.prototype.hasOwnProperty.call(process.env, k)) {
      console.error(`[validate-prod-env] Forbidden env var in production: ${k}`);
      process.exit(2);
    }
  }
  requireJsonArrayCommand('SECRETS_CMD');
}

process.exit(0);
