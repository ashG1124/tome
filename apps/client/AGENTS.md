# apps/client 규칙 (AI 도구용)

루트 `AGENTS.md`를 먼저 따른다. 이 파일은 프런트에만 더해지는 규칙이다.

## 폴더

- `src/app`: 라우터·Provider
- `src/pages/<화면>`: 라우트 1개 = 폴더 1개
- `src/features/<기능>`: `components` · `hooks` · `api.ts` · `model.ts` · `index.ts`
- `src/shared/{api,tokens,copy,ui}`
- `src/assets`

## 규칙

- 기능 폴더 안의 파일을 다른 곳에서 직접 import하지 않는다. `index.ts`가 내보내는 공개 API만 쓴다.
- React Flow(`@xyflow/react`)는 `features/canvas/` 안에서만 import한다.
- 서버 데이터는 TanStack Query. 화면 안 상태는 컴포넌트 state, 여러 컴포넌트가 쓰면 기능별 zustand 스토어 1개. 서버 응답을 전역 상태에 복사하지 않는다.
- 변경 요청(생성·저장·게시 등)은 `Idempotency-Key` 헤더를 붙이고, 응답이 올 때까지 버튼을 잠근다.
- 모달·드롭다운·스위치·탭은 Radix primitive를 감싸서 쓴다.
- 아이콘만 있는 버튼에는 `aria-label`을 둔다.
- 사용자 입력은 텍스트로만 렌더한다. HTML을 삽입하는 API는 쓰지 않는다.
- 기준 화면 1920×1080, 1536×960에서 잘림이 없어야 한다.
- 테스트: 순수 로직은 Vitest, 화면 흐름은 Playwright(headless).
- `shared/api`·`shared/tokens`·`shared/copy`·`shared/ui`를 고쳐야 하면 멈추고 Issue로 요청한다(루트 담당 표).
