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

export const frontendConfig = {
  api: {
    baseUrl: resolveApiBaseUrl(),
    publicOrigin: resolvePublicOrigin(),
    timeoutMs: num(env.VITE_API_TIMEOUT_MS, 5000),
    retries: num(env.VITE_API_RETRIES, 3),
    backoffMs: num(env.VITE_API_BACKOFF_MS, 300),
  },
  sse: {
    streamUrl: (() => {
      const base = resolveApiBaseUrl();
      return env.VITE_SSE_URL ? String(env.VITE_SSE_URL) : `${base}/stream`;
    })(),
    reconnectMs: num(env.VITE_SSE_RECONNECT_MS, 3000),
    maxLogs: num(env.VITE_UI_MAX_LOGS, 2000),
    fieldLockMs: num(env.VITE_UI_FIELD_LOCK_MS, 5000),
    dedupeWindowMs: 1500,
  }
};
