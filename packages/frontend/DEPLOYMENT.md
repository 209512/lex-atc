# Frontend Deployment Modes

This frontend supports two stable modes that are controlled by environment variables.

## Standalone (MSW required)

Use this mode when deploying without a backend.

- `VITE_ENABLE_MSW=true`
- `VITE_API_URL=/api`

Requirements:

- `/mockServiceWorker.js` must be served as a static file from the app origin.
- If the service worker cannot start, the app should be considered non-functional in standalone mode.

## Backend mode (MSW disabled)

Use this mode when a real backend is available.

- `VITE_ENABLE_MSW=false`
- `VITE_API_URL=https://<your-backend-origin>/api`

Notes:

- In this mode, `/api/*` requests go to the real backend, not MSW.
- If MSW is enabled accidentally in this mode, requests may be intercepted.

## Recommended rule

Treat these as a pair:

- Standalone: `VITE_ENABLE_MSW=true` with local `/api`
- Backend: `VITE_ENABLE_MSW=false` with remote `https://.../api`

For local development, prefer the repo scripts:

- `pnpm dev:standalone`
- `pnpm dev:backend`

### Local env files (recommended)

Use `.env.local` for machine-specific settings (do not commit it).

- Standalone: copy `.env.standalone.example` → `.env.local`
- Backend: copy `.env.backend.example` → `.env.local`

## Vercel checklist (Preview / Production)

### 1) Decide what each environment represents

- **Preview**: Standalone demo (backend-free) OR backend-integrated preview
- **Production**: Standalone demo OR backend-integrated production

Do not mix modes within the same environment.

### 2) Standalone set (MSW required)

Set these for the target environment (Preview or Production):

- `VITE_ENABLE_MSW=true`
- `VITE_API_URL=/api`
- Ensure `/mockServiceWorker.js` is publicly served from the same origin

Optional:

- `VITE_DEPLOYMENT_STRICT=true` to block boot on invalid combinations

### 3) Backend set (MSW disabled)

Set these for the target environment (Preview or Production):

- `VITE_ENABLE_MSW=false`
- `VITE_API_URL=https://<backend-origin>/api`

Optional:

- `VITE_SSE_URL=https://<backend-origin>/api/stream` if SSE endpoint differs
- `VITE_DEPLOYMENT_STRICT=true` to block boot on invalid combinations
- `VITE_DEPLOYMENT_FATAL_WARNINGS=...` to control which warnings are treated as fatal in strict mode

### 4) Safety checks after deploy

- Open `/<app>/mockServiceWorker.js`
  - Standalone: should return a JS file (200, text/javascript)
  - Backend: not required, but safe if still present
- Open DevTools console
  - Standalone: should show `[MSW] Mocking enabled.`
  - Backend: should not show MSW enabled unless intentionally enabled

## Strict mode policy

By default, strict mode blocks boot only for warnings that are considered high risk:

- `BACKEND_MODE_WITHOUT_EXPLICIT_API_URL`
- `STANDALONE_MODE_WITH_REMOTE_API_URL`

Override the fatal list with:

- `VITE_DEPLOYMENT_FATAL_WARNINGS=BACKEND_MODE_WITHOUT_EXPLICIT_API_URL,STANDALONE_MODE_WITH_REMOTE_API_URL`

Known warning codes:

- `BACKEND_MODE_WITHOUT_EXPLICIT_API_URL`
- `API_URL_SHOULD_END_WITH_/api`
- `STANDALONE_MODE_WITH_REMOTE_API_URL`
- `UNKNOWN_FATAL_WARNING_CODE` (VITE_DEPLOYMENT_STRICT=true 이면서 VITE_DEPLOYMENT_FATAL_WARNINGS에 알 수 없는 코드가 포함됨)
