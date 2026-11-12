import { LIMITS, type Id, type WorkspaceResponse } from '@tome/shared';

export interface PageMenuItem {
  id: Id;
  /** 화면에 보이는 번호("Page N"의 N). 0부터 세는 index 에 1을 더한다. */
  number: number;
  /** 지금 보고 있는 페이지면 true */
  current: boolean;
}

export interface PageMenu {
  /** 인덱스 버튼 위에 보이는 페이지 수 */
  count: number;
  /** 지금 페이지 번호. 페이지 목록에 없으면 1 */
  currentNumber: number;
  /** index 순서대로 정렬한 페이지 목록 */
  items: PageMenuItem[];
  /** 페이지가 상한(10개)보다 적을 때만 + 로 새 페이지를 더할 수 있다 */
  canAdd: boolean;
}

/**
 * 오른쪽 아이콘 메뉴의 페이지 정보. 페이지 이름은 번호로만 정해진다(이름 변경·삭제·순서 변경 없음).
 * 서버가 준 순서와 상관없이 index 순서로 보여 준다.
 */
export function pageMenu(workspace: Pick<WorkspaceResponse, 'pages' | 'currentPageId'>): PageMenu {
  const items = [...workspace.pages]
    .sort((a, b) => a.index - b.index)
    .map((page) => ({
      id: page.id,
      number: page.index + 1,
      current: page.id === workspace.currentPageId,
    }));
  const current = items.find((item) => item.current);
  return {
    count: items.length,
    currentNumber: current?.number ?? 1,
    items,
    canAdd: items.length < LIMITS.PAGES_MAX,
  };
}

/** 주소의 ?page= 값. 없거나 비어 있으면 undefined(서버가 마지막 페이지를 고른다). */
export function pageIdFromSearch(search: URLSearchParams): Id | undefined {
  const value = search.get('page');
  return value === null || value === '' ? undefined : value;
}
