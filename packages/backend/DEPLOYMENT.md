# Backend Deployment Notes

## Environment Templates

- Local/dev: backend/.env.example
- Production: backend/.env.production.example

## Forbidden Env Vars In Production

The backend enforces a hard fail-fast policy in `NODE_ENV=production`. These env vars must not exist:

- ADMIN_AUTH_DISABLED
- ALLOW_DEV_AUTH_FALLBACK
- ALLOW_DEV_SEED_FALLBACK

Enforced by:

- Backend config loader: `loadBackendConfig`
- Container preflight: `node scripts/validate-runtime-config.js`

## Runtime Preflight (Recommended)

Run this as a deploy hook / initContainer step before starting the app:

```bash
node packages/backend/scripts/validate-runtime-config.js
```

Kubernetes initContainer example:

```yaml
initContainers:
  - name: validate-config
    image: ghcr.io/<org>/lex-atc-backend:<tag>
    command: ["node", "scripts/validate-runtime-config.js"]
```

## Local Determinism (Wallet Seeds)

If you need stable wallets across restarts in local/dev, either set:

- AGENT_KEY_SEED
- TREASURY_KEY_SEED

Or enable:

- ALLOW_DEV_SEED_FALLBACK=true

## bigint Native Bindings

Some dependencies may try to load optional native bigint bindings and print:

`bigint: Failed to load bindings, pure JS will be used`

This is not fatal. For performance-sensitive deployments, ensure the build stage has a C/C++ toolchain. The provided backend Dockerfile uses a build stage that includes `python3/make/g++` and prunes dev deps for a slim runtime image.

## Stress Bench (CPU / Throughput)

To compare pure JS vs native binding environments, run the same stress bench and compare:

```bash
pnpm -C packages/backend bench:stress
```

Override workload via:

```bash
STRESS_AGENTS=100 STRESS_ITERS=5000 STRESS_SHARDS=8 pnpm -C packages/backend bench:stress
```
