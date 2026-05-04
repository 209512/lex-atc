# 운영

## 모드

- [Standalone (MSW Simulation)](./glossary.md#standalone-msw-simulation): `VITE_ENABLE_MSW=true`
- [Backend Mode](./glossary.md#backend-mode): `VITE_ENABLE_MSW=false` + `VITE_API_URL=http(s)://<backend-origin>/api`

UI 상단/사이드바에 현재 모드가 배지로 표시된다(SIMULATION / BACKEND / BACKEND (FALLBACK)).

운영 전 체크리스트: [checklist.md](./checklist.md)
용어: [glossary.md](./glossary.md)
계약 검증/Fail-fast 전환: [contract-mode.md](./contract-mode.md)
배포 게이트(단일 소스): [release-gate.md](./release-gate.md)
프론트 수동 QA: [QA_CHECKLIST.md](../packages/frontend/QA_CHECKLIST.md)
환경변수 로딩 우선순위: [dev/env-loading.md](./dev/env-loading.md)

## 로컬 개발

### 백엔드

```bash
ALLOW_DEV_AUTH_FALLBACK=true pnpm -C packages/backend dev
```

로컬에서 지갑/상태를 고정하려면:

- `AGENT_KEY_SEED`, `TREASURY_KEY_SEED`를 명시
- 또는 `ALLOW_DEV_SEED_FALLBACK=true`(development 기본값은 true, 끄려면 `ALLOW_DEV_SEED_FALLBACK=false`)

### 프론트엔드

로컬 개발에서는 예시 파일을 복사해 `.env.local`로 사용하는 방식을 권장한다(커밋 금지).

- Standalone: `packages/frontend/.env.standalone.example` → `packages/frontend/.env.local`
- Backend: `packages/frontend/.env.backend.example` → `packages/frontend/.env.local`

Standalone 모드:

```bash
pnpm dev:standalone
```

Backend 모드:

```bash
pnpm dev:backend
```

운영 템플릿:

- `packages/frontend/.env.production.example` 참고(`VITE_SSE_STALE_MS` 포함)

## 검증

```bash
pnpm -w verify
pnpm -C packages/frontend test:e2e
```
