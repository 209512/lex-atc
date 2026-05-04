const env = (import.meta as any).env || {};

const num = (v: any, def: number) => {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const normalizeNoTrailingSlash = (v: string) => v.replace(/\/$/, '');

const resolvePublicOrigin = () => {
  const direct = env.VITE_PUBLIC_API_URL || '';
  if (direct) return normalizeNoTrailingSlash(String(direct));

  const api = env.VITE_API_URL || '';
  if (api) {
    const normalized = normalizeNoTrailingSlash(String(api));
    if (normalized.endsWith('/api')) return normalized.slice(0, -4);
    return normalized;
  }

  if (typeof window !== 'undefined') return window.location.origin;
  return '';
};

const resolveApiBaseUrl = () => {
  const direct = env.VITE_API_URL || '';
  if (direct) return normalizeNoTrailingSlash(String(direct));
  const origin = resolvePublicOrigin();
  if (origin) return `${origin}/api`;
  return '/api';
};

const resolveMswEnabled = () => {
  const raw = env.VITE_ENABLE_MSW;
  if (raw === undefined || raw === null || raw === '') return false;
  const v = String(raw).trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
};

const resolveRawApiUrl = () => {
  const direct = env.VITE_API_URL || '';
  return direct ? normalizeNoTrailingSlash(String(direct)) : '';
};

const isAbsoluteHttpUrl = (v: string) => /^https?:\/\//i.test(v);

const resolveStrictDeployment = () => {
  const raw = env.VITE_DEPLOYMENT_STRICT;
  if (raw === undefined || raw === null || raw === '') return Boolean(env.PROD);
  const v = String(raw).trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
};

const parseCsv = (v: any) =>
  String(v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const DEPLOYMENT_WARNING_CODES = [
  'BACKEND_MODE_WITHOUT_EXPLICIT_API_URL',
  'API_URL_SHOULD_END_WITH_/api',
  'STANDALONE_MODE_WITH_REMOTE_API_URL',
  'UNKNOWN_FATAL_WARNING_CODE',
] as const;

type DeploymentWarningCode = typeof DEPLOYMENT_WARNING_CODES[number];

const DEPLOYMENT_WARNING_CODE_SET = new Set<string>(DEPLOYMENT_WARNING_CODES);

const isDeploymentWarningCode = (v: string): v is DeploymentWarningCode =>
  DEPLOYMENT_WARNING_CODE_SET.has(v);

const mswEnabled = resolveMswEnabled();
const rawApiUrl = resolveRawApiUrl();
const apiIsExplicit = Boolean(env.VITE_API_URL || env.VITE_PUBLIC_API_URL);
const apiIsRemote = rawApiUrl ? isAbsoluteHttpUrl(rawApiUrl) : false;
const deploymentStrict = resolveStrictDeployment();
const fatalOverrideRaw = parseCsv(env.VITE_DEPLOYMENT_FATAL_WARNINGS);
const invalidFatalWarningCodes = fatalOverrideRaw.filter((v) => !isDeploymentWarningCode(v));

const computeDeploymentWarnings = (ctx: {
  mswEnabled: boolean;
  rawApiUrl: string;
  apiIsExplicit: boolean;
  apiIsRemote: boolean;
  strict: boolean;
  invalidFatalWarningCodes: string[];
}) => {
  const warnings: DeploymentWarningCode[] = [];
  if (!ctx.mswEnabled) {
    if (!ctx.apiIsExplicit) warnings.push('BACKEND_MODE_WITHOUT_EXPLICIT_API_URL');
    if (ctx.rawApiUrl && !ctx.rawApiUrl.endsWith('/api')) warnings.push('API_URL_SHOULD_END_WITH_/api');
  } else {
    if (ctx.apiIsRemote) warnings.push('STANDALONE_MODE_WITH_REMOTE_API_URL');
  }
  if (ctx.strict && ctx.invalidFatalWarningCodes.length) warnings.push('UNKNOWN_FATAL_WARNING_CODE');
  return warnings;
};

const computeFatalWarningCodes = () => {
  if (fatalOverrideRaw.length) {
    const valid = fatalOverrideRaw.filter(isDeploymentWarningCode);
    const fatal = new Set<DeploymentWarningCode>(valid);
    if (deploymentStrict && invalidFatalWarningCodes.length) fatal.add('UNKNOWN_FATAL_WARNING_CODE');
    return [...fatal];
  }
  return [
    'BACKEND_MODE_WITHOUT_EXPLICIT_API_URL',
    'STANDALONE_MODE_WITH_REMOTE_API_URL',
  ] satisfies DeploymentWarningCode[];
};

export const frontendConfig = {
  msw: {
    enabled: mswEnabled,
  },
  api: {
    baseUrl: resolveApiBaseUrl(),
    rawUrl: rawApiUrl,
    isExplicit: apiIsExplicit,
    isRemote: apiIsRemote,
    publicOrigin: resolvePublicOrigin(),
    timeoutMs: num(env.VITE_API_TIMEOUT_MS, 5000),
    retries: num(env.VITE_API_RETRIES, 3),
    backoffMs: num(env.VITE_API_BACKOFF_MS, 300),
  },
  deployment: {
    mode: (mswEnabled ? 'standalone' : 'backend') as 'standalone' | 'backend',
    strict: deploymentStrict,
    fatalWarningCodes: computeFatalWarningCodes(),
    invalidFatalWarningCodes,
    warnings: computeDeploymentWarnings({ mswEnabled, rawApiUrl, apiIsExplicit, apiIsRemote, strict: deploymentStrict, invalidFatalWarningCodes }),
    fatalWarnings: (() => {
      const warnings = computeDeploymentWarnings({ mswEnabled, rawApiUrl, apiIsExplicit, apiIsRemote, strict: deploymentStrict, invalidFatalWarningCodes });
      const fatalSet = new Set(computeFatalWarningCodes());
      return warnings.filter((w) => fatalSet.has(w));
    })(),
  },
  sse: {
    streamUrl: (() => {
      const base = resolveApiBaseUrl();
      return env.VITE_SSE_URL ? String(env.VITE_SSE_URL) : `${base}/stream`;
    })(),
    reconnectMs: num(env.VITE_SSE_RECONNECT_MS, 3000),
    staleMs: (() => {
      const reconnect = num(env.VITE_SSE_RECONNECT_MS, 3000);
      return num(env.VITE_SSE_STALE_MS, Math.max(reconnect * 5, 10000));
    })(),
    maxLogs: num(env.VITE_UI_MAX_LOGS, 2000),
    fieldLockMs: num(env.VITE_UI_FIELD_LOCK_MS, 5000),
    dedupeWindowMs: 1500,
  }
};
