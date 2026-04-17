FROM node:20-slim

WORKDIR /usr/src/app

RUN npm install -g pnpm

# 1. 설정 파일 복사
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# 2. 패키지들의 package.json 복사
COPY packages/backend/package.json ./packages/backend/
COPY packages/shared/package.json ./packages/shared/

# 3. 의존성 설치
RUN pnpm install --frozen-lockfile

# 4. 소스 코드 복사 (빌드를 위해 소스 전체가 필요함)
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

# 5. shared 패키지 빌드 (TypeScript를 JS로 변환)
RUN pnpm --filter @lex-atc/shared build

# 6. 실행 경로로 이동
WORKDIR /usr/src/app/packages/backend

# 7. 보안 강화를 위해 비권한 사용자(node)로 실행 권한 변경
RUN chown -R node:node /usr/src/app
USER node

EXPOSE 3000
CMD [ "node", "index.js" ]