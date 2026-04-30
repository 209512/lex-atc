# 운영 모드 체크리스트 (1-page)

## A) [Standalone (MSW Simulation)](./glossary.md#standalone-msw-simulation) — 프론트만 운영

목표: Vercel 같은 정적 호스팅에서 프론트만 유지(데모/시뮬레이션).

- Vercel 환경변수
  - `VITE_ENABLE_MSW=true`
  - `VITE_API_URL=/api`
- UI 확인
  - 모드 배지: `SIMULATION`
  - 우상단 워터마크: `Simulation Mode`
- 제약
  - Service Worker 차단 환경에서는 동작 불가(초기화 실패 화면)
  - 운영 현실(권한/지연/실패 패턴)을 1:1 재현하지 않음

## B) [Backend Mode](./glossary.md#backend-mode) — 백엔드 포함 운영

목표: 실제 운영 리스크(권한/지연/실패)를 검증·운영.

- Backend 환경변수(필수/권장)
  - `NODE_ENV=production`
  - `CORS_ALLOWED_ORIGINS=https://<frontend-origin>`
  - `ADMIN_TOKEN_SECRET=...`
  - seed 결정성(권장): `AGENT_KEY_SEED`, `TREASURY_KEY_SEED`
- Forbidden env (존재 자체 금지, production)
  - `ADMIN_AUTH_DISABLED`
  - `ALLOW_DEV_AUTH_FALLBACK`
  - `ALLOW_DEV_SEED_FALLBACK`
- UI 확인
  - 모드 배지: `BACKEND`

## C) 공통 검증

```bash
pnpm -w verify
pnpm -C packages/frontend test:e2e
```

용어: [glossary.md](./glossary.md)
