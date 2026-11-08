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

팀 안에서 받은 `tome-docs.zip`을 저장소 맨 위에 풀어 `.tome-docs/` 폴더를 만듭니다. 이 폴더는 git에서 제외되어 있으니 커밋하지 마세요. AI 도구가 이 폴더를 읽습니다.

## 디자인 자산

팀 안에서 받은 파일을 `design-ref/`, `apps/client/src/assets/icons/`, `apps/client/src/assets/brand/`에 넣습니다(git 제외). 없어도 빈 자리로 화면은 뜹니다.

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
DB 테스트까지 돌리려면 `TEST_DATABASE_URL`에 위 DB 주소를 넣고 `pnpm --filter @tome/server test`를 실행합니다(없으면 DB 테스트는 건너뜁니다).

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
- 디자인 자산(아이콘·로고·Figma 참조)은 이 저장소에 넣지 않습니다. 팀 안에서 파일로 공유합니다.
