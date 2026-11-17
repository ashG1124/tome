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
# 실행에 필요한 의존성(dependencies)만 /prod 에 따로 설치한다(#76).
# wrangler·nest cli·vitest·prisma CLI 같은 개발용 패키지는 빠진다.
# 마이그레이션은 컨테이너 밖에서 돌리므로 prisma CLI 가 없어도 된다.
# dist 는 .gitignore 대상이라 deploy 가 복사하지 않으므로 아래에서 따로 복사한다.
RUN pnpm --filter @tome/server deploy --prod /prod

# ---- runtime ----
FROM node:22.23.4-bookworm-slim AS runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
# /app 폴더 자체도 node 소유여야 로컬 저장소(STORAGE_DRIVER=local)가 .storage 폴더를 만들 수 있다.
RUN mkdir /app && chown node:node /app
WORKDIR /app
COPY --from=build --chown=node:node /prod /app
COPY --from=build --chown=node:node /app/apps/server/dist /app/dist
USER node
EXPOSE 3000
# 마이그레이션은 컨테이너에서 돌리지 않는다. 배포 전에 direct 주소로 따로 실행한다
# (순서: prisma migrate deploy → wrangler deploy).
# exec 형식이라 node 가 1번 프로세스가 되어 종료 신호(SIGTERM)를 받으면 바로 꺼진다
# (sh 가 1번이면 신호를 무시해서 컨테이너가 잠들지 못한다).
CMD ["node", "dist/main.js"]
