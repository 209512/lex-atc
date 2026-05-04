# 환경변수 로딩 우선순위 (1-page)

목표: 로컬/CI/배포에서 “어떤 env 파일이 언제 적용되는지”를 명확히 해서 모드 오해와 설정 불일치를 줄인다.

## Frontend (Vite)

기본 원칙:

- Vite는 `packages/frontend` 디렉터리를 기준으로 env 파일을 읽는다.
- 로컬 개발에서는 `.env.local`을 권장한다(커밋 금지).

권장 운영 방식:

- Standalone: `.env.standalone.example` → `.env.local`
- Backend: `.env.backend.example` → `.env.local`

참고 파일:

- `packages/frontend/.env.production.example` (배포 예시)
- `packages/frontend/.env.example` (모드와 무관한 공통 예시 값)

## Backend (dotenv)

기본 원칙:

- backend는 시작 시 `dotenv.config()`를 호출한다.
- `pnpm -C packages/backend dev` 또는 workspace filter로 실행할 때, backend의 현재 작업 디렉터리(`packages/backend`) 기준으로 `.env`를 읽는다.

권장 운영 방식:

- 로컬 개발: 필요한 경우에만 `packages/backend/.env`를 두고(커밋 금지), 예시는 `packages/backend/.env.example`를 참고한다.
- 운영/배포: 환경변수는 배포 플랫폼(Render/K8s/Secrets Manager 등)에서 주입하고, production에서 dev-only env(`ADMIN_AUTH_DISABLED`, `ALLOW_DEV_AUTH_FALLBACK`, `ALLOW_DEV_SEED_FALLBACK`)는 금지된다.

