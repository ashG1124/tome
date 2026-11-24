import { useLocation, useSearchParams } from 'react-router';

/** 헤더 검색 필터 = 아고라 탭(Project / Creator / Topic). 탭마다 화면(주소)이 따로 있다(#214). */
export type AgoraSearchScope = 'project' | 'creator' | 'topic';

export const AGORA_SEARCH_SCOPES: readonly AgoraSearchScope[] = ['project', 'creator', 'topic'];

/** 탭 화면 주소. Project = 아고라 홈, Creator = 창작자 모음, Topic = 핫토픽 목록 */
export const AGORA_TAB_PATHS = {
  project: '/agora',
  creator: '/agora/creators',
  topic: '/agora/topics',
} as const satisfies Record<AgoraSearchScope, string>;

export interface AgoraSearch {
  /** 검색어(앞뒤 공백 없음). 비었으면 거르지 않는다 */
  q: string;
  /** 지금 탭. 이 탭 화면 안에서 거른다 */
  scope: AgoraSearchScope;
}

/**
 * 주소가 어느 탭에 속하는지. 핫토픽 화면(/agora/topics/:id)은 Topic, 프로젝트 상세는 Project.
 * 아고라 밖이면 null.
 */
export function agoraTabOfPath(pathname: string): AgoraSearchScope | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === AGORA_TAB_PATHS.creator || path.startsWith(`${AGORA_TAB_PATHS.creator}/`)) {
    return 'creator';
  }
  if (path === AGORA_TAB_PATHS.topic || path.startsWith(`${AGORA_TAB_PATHS.topic}/`)) {
    return 'topic';
  }
  if (path === AGORA_TAB_PATHS.project || path.startsWith(`${AGORA_TAB_PATHS.project}/`)) {
    return 'project';
  }
  return null;
}

/** 입력하는 대로 같은 화면에서 거르는 아고라 화면(세 탭과 핫토픽). 프로젝트 상세는 Enter 로 탭 화면에 가서 적용한다. */
export function isLiveFilterPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return (
    path === AGORA_TAB_PATHS.project ||
    path === AGORA_TAB_PATHS.creator ||
    path === AGORA_TAB_PATHS.topic ||
    path.startsWith(`${AGORA_TAB_PATHS.topic}/`)
  );
}

/** 주소의 검색어(?q=…). 탭은 주소 경로가 정한다. */
export function parseAgoraSearch(pathname: string, params: URLSearchParams): AgoraSearch {
  return {
    q: (params.get('q') ?? '').trim(),
    scope: agoraTabOfPath(pathname) ?? 'project',
  };
}

/** 검색어를 쿼리 문자열로 쓴다. 검색어가 비면 쿼리가 없다. */
export function agoraSearchQuery(q: string): string {
  const trimmed = q.trim();
  if (trimmed === '') return '';
  return `?${new URLSearchParams({ q: trimmed }).toString()}`;
}

/** 탭 화면 주소(검색어를 그대로 가져간다) */
export function agoraTabHref(scope: AgoraSearchScope, q: string): string {
  return `${AGORA_TAB_PATHS[scope]}${agoraSearchQuery(q)}`;
}

/**
 * 예전 주소(/agora?q=…&in=creator)를 탭 주소로 옮길 곳. in 이 Creator·Topic 이면 그 탭 주소, 아니면 null.
 * 북마크·테스트 링크가 깨지지 않게 아고라 홈이 한 번 바꿔 준다.
 */
export function legacyAgoraTabHref(params: URLSearchParams): string | null {
  const scope = params.get('in');
  if (scope !== 'creator' && scope !== 'topic') return null;
  return agoraTabHref(scope, params.get('q') ?? '');
}

/** 지금 주소의 아고라 검색 상태 */
export function useAgoraSearch(): AgoraSearch {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  return parseAgoraSearch(pathname, params);
}

/** 글자에 검색어가 들어 있는지(대소문자 무시). 검색어가 비면 항상 true. */
export function matchesQuery(text: string, q: string): boolean {
  const needle = q.trim().toLocaleLowerCase();
  return needle === '' || text.toLocaleLowerCase().includes(needle);
}
