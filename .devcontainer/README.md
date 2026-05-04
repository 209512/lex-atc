## Devcontainer profiles

### 기본(Node)

- 경로: `.devcontainer/devcontainer.json`
- 포함: Node 22, pnpm(corepack), python3/make/g++
- 용도: frontend/backend/shared 개발

### Fullstack(Node + Contracts)

- 경로: `.devcontainer/fullstack/devcontainer.json`
- 포함: 기본 프로파일 + rust toolchain + solana-cli + anchor-cli
- 용도: contracts 개발/빌드까지 포함한 통합 환경
