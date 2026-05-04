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
  - 계약 검증(권장): `CONTRACT_MODE=warn` → 안정화 후 `enforce`
  - CSRF(권장): `CSRF_ENFORCE_ALL_UNSAFE=true`
  - SSE 단일 퍼블리셔 보장(권장): Redis 정상 구성(리더십 fail-closed)
    - production에서 Redis 미구성/장애 시 기본적으로 publish가 멈춘다(fail-closed)
    - 단일 인스턴스/개발 예외로만 `SSE_UNSAFE_SINGLE_INSTANCE_FALLBACK=true`
  - Sandbox allowlist(권장): `SANDBOX_ALLOWED_BINARIES=/bin/echo`(comma-separated)
  - Sandbox command 정책(선택): `SANDBOX_COMMAND_POLICY_JSON=...` (roles/classifications/timeout)
  - seed 결정성(권장): `AGENT_KEY_SEED`, `TREASURY_KEY_SEED`
- Forbidden env (존재 자체 금지, production)
  - `ADMIN_AUTH_DISABLED`
  - `ALLOW_DEV_AUTH_FALLBACK`
  - `ALLOW_DEV_SEED_FALLBACK`
- UI 확인
  - 모드 배지: `BACKEND`
  - SSE 상태 배지:
    - 연결 끊김: `SSE DOWN`
    - 연결은 있으나 업데이트 정지: `STREAM STALE`
  - 계약 위반 관측(권장)
    - `lex_atc_contract_validation_failures_total` 증가 여부 확인(0 유지가 목표)
  - 문서
    - 계약 검증/Fail-fast 전환: [contract-mode.md](./contract-mode.md)

## C) 공통 검증

```bash
pnpm -w verify
pnpm -C packages/frontend test:e2e
pnpm release:check -- --env-file <prod-env-file>
```

CD 표준(단일 소스): 배포 도구가 확정되면 prod env를 JSON으로 출력 → `jq -c -f scripts/release-env/normalize.jq` → `pnpm release:check -- --stdin-json`로 고정
문서: [release-gate.md](./release-gate.md)

UI 수동 QA(권장): [QA_CHECKLIST.md](../packages/frontend/QA_CHECKLIST.md)
데모/자동 녹화(선택): [demo.md](./demo.md)

Alerting 튜닝(운영 확정): `SANDBOX_FORBIDDEN_SPIKE_WINDOW` / `SANDBOX_FORBIDDEN_SPIKE_THRESHOLD`를 prod/staging 별로 확정해 provisioning env(.env/배포 환경변수)로 고정

용어: [glossary.md](./glossary.md)
