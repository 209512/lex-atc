## Command Spec 전환 체크리스트 (SECRETS_CMD / RELEASE_ENV_CMD)

### 목표

`SECRETS_CMD`, `RELEASE_ENV_CMD`는 더 이상 문자열 쉘 커맨드를 허용하지 않는다. 반드시 JSON 배열 커맨드 스펙만 사용한다.

### 규칙

- 값은 JSON 배열 문자열
- 첫 번째 원소는 실행 파일, 이후는 argv
- 파이프라인이 필요하면 명시적으로 `["/bin/sh","-lc","..."]` 형태로 작성

### 예시

- Node 스크립트 실행
  - `SECRETS_CMD=["node","scripts/secrets/export.js"]`
- jq 정규화 포함 파이프라인
  - `RELEASE_ENV_CMD=["/bin/sh","-lc","./scripts/release/export.sh | jq -c -f scripts/release-env/normalize.jq"]`

### 점검(로컬/CI 공통)

- 로컬/CI에서 아래 커맨드가 통과해야 한다
  - `node scripts/check-command-specs.js`
- CD에서 아래가 통과해야 한다
  - `NODE_ENV=production node packages/backend/scripts/validate-prod-env.js`
  - `NODE_ENV=production node scripts/export-release-env-json.js | node scripts/release-check.js --stdin-json`

### 롤아웃 순서(권장)

- 1) CI/CD secret 값을 JSON 배열로 먼저 전환
- 2) staging에서 배포/롤백 1회 이상 검증
- 3) production 반영

