# 빌드 컨텍스트는 저장소 루트다: docker build -f apps/server/Dockerfile .
# 설정은 환경변수로만 받는다.

# ---- build ----
FROM node:22.23.4-bookworm-slim AS build
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.16.1
WORKDIR /app

# 의존성 레이어 캐시용: 매니페스트만 먼저 복사
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .nvmrc ./
COPY scripts/only-pnpm.mjs scripts/install-git-hooks.mjs scripts/
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN pnpm install --frozen-lockfile --filter "@tome/server..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
# @tome/shared 를 먼저 빌드한 뒤 prisma generate + nest build 순서로 실행된다.
RUN pnpm --filter "@tome/server..." build

# ---- runtime ----
FROM node:22.23.4-bookworm-slim AS runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
# 컨테이너에서 prisma migrate deploy 를 실행하려고 node_modules 를 그대로 가져온다.
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/server
EXPOSE 3000
# exec 로 node 를 1번 프로세스로 만든다. sh 가 1번이면 종료 신호(SIGTERM)를 무시해서
# 컨테이너가 잠들지 못하고(sleepAfter) 강제 종료될 때까지 계속 켜져 있다.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
