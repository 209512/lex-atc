# Render 배포(Docker)

Render에서 백엔드를 계속 운영해야 한다면, “빌드 재현성/로그 일관성/운영 단순화”를 위해 Docker 배포로 고정하는 방식을 권장한다.

## 백엔드 서비스

### 1) 타입

- 서비스 유형: Web Service
- 런타임: Docker
- Dockerfile: `packages/backend/Dockerfile`

### 2) 환경변수

- `NODE_ENV=production`
- `PORT=3000` (Render의 PORT를 따르도록 구성 가능)
- `CORS_ALLOWED_ORIGINS=https://<frontend-origin>`
- `ADMIN_TOKEN_SECRET=...`
- `DATABASE_URL=...` (필요 시)

프로덕션에서 아래 env는 “존재 자체가 금지”된다:

- `ADMIN_AUTH_DISABLED`
- `ALLOW_DEV_AUTH_FALLBACK`
- `ALLOW_DEV_SEED_FALLBACK`

컨테이너 시작 시 `validate-runtime-config.js`가 실행되어, 잘못된 설정이면 앱이 뜨지 않고 즉시 실패한다.

### 3) Seed 결정성

운영에서 seed를 고정하려면(권장):

- `AGENT_KEY_SEED`, `TREASURY_KEY_SEED`를 명시적으로 설정

## 프론트 서비스(Vercel Standalone)

프론트만 유지할 경우, Vercel 환경변수:

- `VITE_ENABLE_MSW=true`
- `VITE_API_URL=/api`

Standalone은 브라우저 Service Worker에 의존하므로, SW가 차단되는 환경에서는 동작하지 않는다.

## 프론트만 운영 시(Render 과금/리소스 사용 방지)

목표: 프론트는 Vercel Standalone로 유지하고, Render 백엔드는 더 이상 운영하지 않음.

- Render에서 백엔드 서비스를 중지/삭제(권장)
  - Render Dashboard → 해당 Web Service → Settings/Environment 확인 후 서비스 삭제 또는 suspend
  - 삭제 전, ENV에 민감정보가 있다면 먼저 제거(키 회수/폐기 포함)
- GitHub Actions/CD 측면
  - backend 배포 관련 secrets가 없으면 CD가 실질적으로 배포를 진행하지 못하므로, 불필요한 배포 트리거를 줄이려면 secrets를 제거하고 workflow trigger를 최소화하는 것이 안전함
  - frontend만 배포한다면 Vercel 쪽 환경변수(`VITE_ENABLE_MSW=true`, `VITE_API_URL=/api`)만 유지
