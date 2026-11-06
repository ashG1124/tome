# AGENTS.md — TÓME

이 파일은 이 저장소에서 일하는 AI 코딩 도구(Codex·Claude Code 등)와 사람이 함께 따르는 작업 규칙이다. 폴더별 `AGENTS.md`가 있으면 그 규칙이 이 파일보다 우선한다.

## 1. 먼저 할 일

1. 맡은 GitHub Issue를 읽는다. Issue의 "할 일"과 "완료 기준"이 이번 작업의 범위다.
2. 기획 문서는 저장소 맨 위의 `.tome-docs/` 폴더에 있다(팀원 PC에만 있고 git에서 제외됨). 작업 전에 `.tome-docs/README.md`와 Issue에 해당하는 기능 문서를 직접 연다. 검색 결과에 안 나와도 경로로 열 수 있다.
3. `.tome-docs/`가 없으면 작업을 멈추고 사람에게 알린다. 기획 문서에 없는 내용은 지어내지 말고 질문으로 남긴다.
4. 작업 전에 바꿀 파일 목록을 먼저 말하고 확인을 받는다.

## 2. 공개 저장소 규칙

- 이 저장소는 공개다. `.tome-docs/`의 내용을 저장소 파일, 코드 주석, Issue, PR, 커밋 메시지에 옮겨 적지 않는다.
- `.tome-docs/`를 커밋하지 않는다(`git add -f` 금지). `.tome-docs/` 안의 파일을 수정하지 않는다.
- `.env*` 파일을 읽거나 출력하거나 커밋하지 않는다. 키·토큰·계정 ID·서비스 URL은 코드에 쓰지 않고 환경변수로 받는다.
- 디자인 자산(`design-ref/`, `apps/client/src/assets/icons/`, `apps/client/src/assets/brand/`)은 커밋하지 않는다. 없으면 같은 크기의 빈 자리로 그린다.

## 3. 담당 폴더

| 누구                        | 맡는 곳                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 프런트                      | `apps/client/src/pages/*`, `apps/client/src/features/canvas/`                                                      |
| 백엔드 리드                 | `packages/shared`, `apps/server/prisma`(마이그레이션), `apps/server/src/{ai,config}`, `apps/client/src/shared/api` |
| 백엔드 리드·팀원            | `apps/server/src/modules/*`(Issue에 배정된 기능)                                                                   |
| 공통 부품(백엔드 담당 승인) | `apps/client/src/shared/{tokens,copy,ui}`, 루트 설정, `.github/`                                                   |

- Issue에 적힌 폴더만 고친다. 담당 밖 폴더를 고쳐야 하면 멈추고 사람에게 알린다.
- 프런트가 `packages/shared`·서버 변경이 필요하면 새 Issue로 요청한다.
- 백엔드 팀원이 `packages/shared`·마이그레이션 변경이 필요하면 멈추고 백엔드 리드에게 묻는다. 서버 세부 규칙은 `apps/server/AGENTS.md`.
- Claude Code는 `CLAUDE.md`의 `@AGENTS.md` 가져오기로 이 파일을 읽는다.

## 4. 코드 규칙

- 화면 문구는 영어이고 `apps/client/src/shared/copy`에만 둔다. 문구 ID(예: S-03, E-01)를 키로 쓴다.
- 색·간격·글자 크기는 `shared/tokens`만 쓴다. hex·px 값을 직접 쓰지 않는다.
- API 타입은 `packages/shared`의 zod 스키마에서만 가져온다. 화면에서 타입을 새로 만들지 않는다.
- 서버 없이 작업할 때는 `shared/api`의 가짜 응답 모드를 쓴다.
- 날짜는 절대 날짜로만 표시한다("6d ago" 같은 상대 표기 금지).
- 포커스 테두리·비활성·오류·로딩 상태는 공통 규칙을 따른다(`role="alert"`, `role="status"`).
- Figma는 읽기만 한다. 디자인 파일을 수정하는 도구를 호출하지 않는다.

## 5. 도구·패키지

- 패키지 매니저는 `pnpm`만 쓴다. Node 22(`.nvmrc`).
- 새 패키지를 설치하기 전에 사람에게 묻는다.
- 브라우저 자동화(Playwright 등)는 headless로만 실행한다. 창을 띄우지 않는다.

## 6. Git·PR

- dev·main에 직접 push하지 않는다. PR 대상은 항상 dev(기본 브랜치). main은 배포용으로 사람이 dev에서 합친다. 브랜치 `<종류>/<영역>-<Issue번호>-<짧은-이름>`(종류 feat·fix·chore·docs, 영역 front·back·shared·infra(캔버스도 front), 예 `feat/front-23-home-shelf`).
- PR 하나 = Issue 하나. PR 본문 첫 줄 `Closes #<번호>`.
- PR 전에 반드시 통과: `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm format:check`. 실패를 숨기거나 테스트를 지워서 통과시키지 않는다.
- 화면 작업이면 `pnpm design:check` 결과와 화면 캡처를 PR에 붙인다.
- 바꾼 내용과 이유를 초보 팀원이 이해할 수 있는 쉬운 말로 PR에 쓴다.
- PR 템플릿: 화면 작업은 PR 주소 끝에 `?template=front.md`, 서버 작업은 `?template=back.md`.

### 카드 흐름

1. Issue를 고른다.
2. GitHub Project 카드를 In progress로 옮긴다.
3. 브랜치를 만들고 커밋·push 한다.
4. PR을 만든다(대상 dev, 본문 첫 줄 `Closes #번호`). 카드가 In review로 자동 이동한다.
5. 리뷰·수정은 같은 브랜치에 push 한다.
6. 관리자가 squash 병합하면 Issue가 닫히고 카드가 Done으로 자동 이동한다. 카드를 손으로 Done에 옮기지 않는다(Issue가 바로 닫힌다).

## 7. 자주 쓰는 명령

아래 명령 중 client·shared 관련은 해당 패키지가 들어온 뒤 동작한다.

```bash
pnpm install
pnpm --filter @tome/shared build
pnpm --filter @tome/client dev
pnpm test
pnpm design:check
```
