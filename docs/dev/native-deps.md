## Native 의존성 표준화(bigint-buffer 등)

### 목표

로컬/CI/컨테이너 환경에서 네이티브 바인딩(예: bigint-buffer)이 환경 차이로 경고/성능 저하를 일으키지 않도록, 설치 시점에 재빌드를 표준화한다.

### 로컬

- 기본: `pnpm install` 시 postinstall에서 `pnpm rebuild bigint-buffer`를 시도한다.
- 스킵: `LEX_ATC_SKIP_NATIVE_REBUILD=true pnpm install`

### CI

- node-gyp 빌드 툴이 없는 이미지에서는 아래가 필요하다
  - `python3`, `make`, `g++`
- 워크플로우에서 pnpm install 전에 빌드 툴 설치를 수행한다.

### Docker

- backend Dockerfile 빌드 스테이지에서 `pnpm rebuild bigint-buffer`를 명시적으로 실행한다.

