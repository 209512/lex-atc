# Operations

## Modes

- [Standalone (MSW Simulation)](./glossary.md#standalone-msw-simulation): `VITE_ENABLE_MSW=true`
- [Backend Mode](./glossary.md#backend-mode): `VITE_ENABLE_MSW=false` + `VITE_API_URL=http(s)://<backend-origin>/api`

UI 상단/사이드바에 현재 모드가 배지로 표시된다(SIMULATION / BACKEND / BACKEND (FALLBACK)).

운영 전 체크리스트: [checklist.md](./checklist.md)
용어: [glossary.md](./glossary.md)

## Local Development

### Backend

```bash
ADMIN_AUTH_DISABLED=true INIT_AGENTS=2 pnpm -C packages/backend dev
```

로컬에서 지갑/상태를 고정하려면:

- `AGENT_KEY_SEED`, `TREASURY_KEY_SEED`를 명시
- 또는 `ALLOW_DEV_SEED_FALLBACK=true`

### Frontend

Standalone:

```bash
VITE_ENABLE_MSW=true VITE_API_URL=/api pnpm -C packages/frontend dev
```

Backend mode:

```bash
VITE_ENABLE_MSW=false VITE_API_URL=http://127.0.0.1:3000/api pnpm -C packages/frontend dev
```

## Verification

```bash
pnpm -w verify
pnpm -C packages/frontend test:e2e
```
