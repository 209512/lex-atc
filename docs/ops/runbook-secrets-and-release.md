## Runbook: Secrets / Release Gates

### 범위

- `SECRETS_CMD`
- `RELEASE_ENV_CMD`
- `ADMIN_TOKEN_SECRET` 및 운영 릴리즈 게이트(`release-check`)
- GitHub Actions secrets (워크플로우별 최소 권한)

### 워크플로우별 secrets 인벤토리

- 정책: 워크플로우 파일은 “파일명 + top-level name” 조합 기준으로 allowlist가 반드시 존재해야 한다.
  - 검증 스크립트: `node scripts/check-workflow-secrets.js`
- 단일 소스(SSOT): `docs/ops/workflow-secrets.json`
- 사람이 읽기 쉬운 버전(자동 생성): `docs/ops/workflow-secrets.md`

### 변경 원칙

- 운영 환경에서 문자열 쉘 커맨드 형태는 사용하지 않는다. JSON 배열 커맨드 스펙만 허용한다.
- 시크릿 변경은 “요청 → 검토 → 적용 → 검증 → 기록” 순서로 수행한다.
- 롤백 가능한 방식으로만 변경한다.

### 역할

- 요청자: 변경 필요 사유, 영향 범위, 롤백 계획을 포함해 요청한다.
- 검토자(2인): 커맨드 스펙/권한/출력 JSON 스키마/로그 노출 위험을 검토한다.
- 적용자: CI/CD 시크릿을 변경하고 배포 전 검증을 통과시키며, 변경 기록을 남긴다.

### 변경 절차

#### 1) 사전 준비

- 변경 대상의 기존 값과 적용 위치(GitHub Actions secrets, Render/Vercel env, Vault 등)를 확인한다.
- 출력 JSON 포맷(키/타입)을 명확히 한다.

#### 2) 커맨드 스펙 작성 규칙

- 값은 JSON 배열 문자열
- 첫 원소는 실행 파일, 이후는 argv
- 파이프가 필요하면 명시적으로 `/bin/sh -lc`를 사용한다
  - 예: `["/bin/sh","-lc","./scripts/release/export.sh | jq -c -f scripts/release-env/normalize.jq"]`

#### 3) 점검(변경 전)

- 로컬 또는 CI에서 커맨드 스펙 검증
  - `node scripts/check-command-specs.js`
- CD 릴리즈 게이트가 요구하는 invariants 검증
  - `NODE_ENV=production node packages/backend/scripts/validate-prod-env.js`
  - `NODE_ENV=production node scripts/export-release-env-json.js | node scripts/release-check.js --stdin-json`

#### 4) 적용(스테이징 우선)

- 스테이징 시크릿부터 먼저 변경한다.
- 배포 후, UI/백엔드 핵심 플로우를 스모크한다.
- 이상 없으면 프로덕션에 동일 절차로 반영한다.

#### 5) 롤백

- 장애 발생 시 시크릿을 즉시 이전 값으로 되돌린다.
- 롤백 후 동일 검증 커맨드를 재실행한다.

### 기록

- 변경 요청 링크, 적용 시각, 적용자, 검토자, 변경된 키(값 제외), 검증 로그 링크를 남긴다.
