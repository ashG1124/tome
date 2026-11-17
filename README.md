# TÓME

졸업작품 웹앱 TÓME 저장소입니다.

## 준비

- Node 22.22 이상 (`node -v`로 확인)
- pnpm을 한 번 설치합니다: `npm install -g pnpm`
- `npm install`은 막혀 있습니다. 항상 `pnpm`을 씁니다.

## 받기·설치

```bash
git clone https://github.com/ashG1124/tome.git
cd tome
pnpm install
```

`pnpm install` 때 git 훅이 자동으로 설치됩니다.

## 팀 문서

팀 안내에 따라 문서 저장소를 저장소 맨 위 `.tome-docs/`에 clone 하고, 작업 전에 `pnpm docs:pull`로 최신을 받습니다. 이 폴더는 git에서 제외되어 있으니 커밋하지 마세요. AI 도구가 이 폴더를 읽습니다.

## 디자인 자산

팀 안내에 따라 자산 저장소를 저장소 맨 위 `.tome-assets/`에 clone 하고, 작업 전에 `pnpm assets:pull`로 최신을 받습니다. 이 명령이 `design-ref/`, `apps/client/src/assets/icons/`, `apps/client/src/assets/brand/`에 파일을 복사합니다(모두 git 제외, 커밋하지 마세요). 없어도 빈 자리로 화면은 뜹니다.

## 화면만 실행 (서버·Docker 없이 가짜 응답 모드)

```bash
pnpm --filter @tome/shared build
pnpm --filter @tome/client dev
```

(T1-d 병합 후 동작)

## 서버 실행 (Docker)

로컬 Postgres는 호스트 포트 55433, 서버는 3001을 씁니다(`docker-compose.yml`, 프로젝트 이름 `tome-dev`).

```bash
docker compose up -d db
cp apps/server/.env.example apps/server/.env
pnpm --filter @tome/shared build
pnpm --filter @tome/server prisma:migrate:deploy
pnpm --filter @tome/server db:seed
pnpm --filter @tome/server start:dev
```

`.env`의 `PORT`가 3000이면 `http://localhost:3000/health`, 서버 컨테이너(`docker compose up -d server`)는 `http://localhost:3001/health`로 확인합니다.
이미지는 기본으로 로컬 폴더(`STORAGE_DRIVER=local`)에 저장합니다. 로컬에서 R2를 쓰려면 `.env`에 `STORAGE_DRIVER=r2`와 `R2_*` 네 값을 넣습니다(값은 인프라 담당에게 받고, 커밋하지 않습니다).
DB 테스트까지 돌리려면 `TEST_DATABASE_URL`에 위 DB 주소를 넣고 `pnpm --filter @tome/server test`를 실행합니다(없으면 DB 테스트는 건너뜁니다).

## 실서버 배포 (인프라 담당)

- **자동 배포:** dev를 main에 병합하면 `.github/workflows/deploy.yml`이 운영 DB 마이그레이션 → 배포 → `/health`의 `version` 확인 순서로 돌립니다. Actions 탭의 **Deploy**에서 손으로 다시 돌릴 수도 있습니다(Run workflow).
- **배포 동결:** 저장소 변수 `DEPLOY_FREEZE`를 `true`로 바꾸면 자동 배포가 멈추고 경고만 남깁니다. 풀 때는 `false`.
- **운영 시간 깨우기:** Worker가 5분마다 Worker 비밀값 `WAKE_WINDOWS`(한국 시간 시간표, 형식은 `apps/server/worker/wake.ts`)를 보고 그 안일 때만 서버를 깨웁니다. 시간표는 저장소에 적지 않습니다.
- **자동이 안 될 때(손으로):**
  - 깨우기: 개장 전·쉬는 시간마다 브라우저로 서버의 `/health`를 엽니다(첫 응답은 몇 초 걸림).
  - 배포: `apps/server`에서 direct DB 주소로 `pnpm exec prisma migrate deploy` → `npx wrangler deploy --var APP_VERSION:<커밋 해시>` → `/health`의 `version` 확인.

## 검사

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

## 첫 작업

GitHub Project의 Ready 카드에서 Issue를 고른 뒤, `AGENTS.md`의 순서대로 진행합니다.

## 서체

- 서체: Pretendard Variable (`apps/client/src/assets/fonts/pretendard/`, SIL OFL 1.1, 라이선스 파일 동봉, 원본 수정 없음)
- 디자인 자산(아이콘·로고·Figma 참조)은 이 저장소에 넣지 않습니다. 팀 자산 저장소를 clone 한 뒤 `pnpm assets:pull`로 받습니다.
