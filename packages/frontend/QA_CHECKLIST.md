# QA Checklist (Frontend)

This checklist focuses on real user flows and is designed to catch regressions beyond automated tests.

## Prerequisites

- Standalone mode: `VITE_ENABLE_MSW=true`, `VITE_API_URL=/api`
- Backend mode: `VITE_ENABLE_MSW=false`, `VITE_API_URL=https://<backend-origin>/api`
- Optional: `VITE_DEPLOYMENT_STRICT=true` to fail fast on invalid env combinations

## Standalone (MSW required)

1. Open the app and verify MSW starts:
   - DevTools Console includes `[MSW] Mocking enabled.`
   - `/<origin>/mockServiceWorker.js` returns 200 and JS
2. Radar + Agents:
   - Canvas renders and drones animate
   - Increasing agent count updates the visible counter (e.g. `3/10` → `4/10`)
3. 8D riskVector visibility:
   - Click an agent label to open detail popup
   - Verify Risk Vector bars render and respond over time
   - Hover a drone and verify HUD shows axis values (Full/Compact)
4. Settings:
   - Open System Settings
   - Switch `RISK_VECTOR_HUD` between Full(8D) and Compact(4D)
   - Refresh and confirm the preference persists
5. Operations:
   - Run a settlement dispute and slash flow via the Operations panel and confirm UI state changes

## Backend mode (MSW disabled)

1. Open the app:
   - Console should not show MSW enabled logs
   - `/api/agents/status` should be served by backend
2. SSE stream:
   - Verify events are received and UI updates without full refresh
3. Admin session:
   - Confirm `/api/auth/session` works as expected (cookie or signature flow depending on backend config)

## Deployment/Env safety checks

- If `VITE_DEPLOYMENT_STRICT=true` and configuration is invalid:
  - The app should stop booting and show the configuration error screen.

