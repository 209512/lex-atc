const forbiddenInProd = [
  'ADMIN_AUTH_DISABLED',
  'ALLOW_DEV_AUTH_FALLBACK',
  'ALLOW_DEV_SEED_FALLBACK',
];

const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();

if (nodeEnv === 'production') {
  for (const k of forbiddenInProd) {
    if (Object.prototype.hasOwnProperty.call(process.env, k)) {
      console.error(`[validate-prod-env] Forbidden env var in production: ${k}`);
      process.exit(2);
    }
  }
}

process.exit(0);
