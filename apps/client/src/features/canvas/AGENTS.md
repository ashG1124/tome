# features/canvas 규칙 (AI 도구용)

루트 `AGENTS.md`와 `apps/client/AGENTS.md`를 먼저 따른다. 이 파일은 캔버스 기술 규칙만 더한다.

- React Flow import는 이 폴더 안에서만 한다.
- 성능: 노드 컴포넌트는 `memo`로 감싼다. `nodeTypes`·`edgeTypes`는 컴포넌트 밖 상수로 둔다. 값 변경은 `updateNodeData`로 해당 노드만 갱신하고, 전체 nodes 배열을 통째로 바꾸지 않는다.
- 키 충돌: 다이얼·패드처럼 자체 키 처리를 하는 요소는 처리한 키에 `preventDefault`+`stopPropagation`을 호출하고, 요소에 `nodrag nopan nowheel` 클래스를 붙인다.
- Tab: `edgesFocusable={false}`. 노드 펼침은 노드의 Enter가 아니라 별도 버튼(`aria-expanded`)으로 한다. `disableKeyboardA11y`는 쓰지 않는다.
- 포커스 시 화면 보정은 DOM 좌표가 아니라 React Flow store 좌표로 계산한다.
- 접근성 문구(`ariaLabelConfig`, 노드 ariaLabel)는 `shared/copy`에서만 가져온다.
- 키보드 이동 방식과 값 범위(가중치·패드 등)는 `.tome-docs/`의 노드 편집 문서를 따른다. 문서에 없으면 지어내지 말고 질문한다.
