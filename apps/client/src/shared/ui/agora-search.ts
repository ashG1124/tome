import { useSearchParams } from 'react-router';

/** 헤더 검색의 거를 대상(Project / Creator / Topic) */
export type AgoraSearchScope = 'project' | 'creator' | 'topic';

export const AGORA_SEARCH_SCOPES: readonly AgoraSearchScope[] = ['project', 'creator', 'topic'];

export interface AgoraSearch {
  /** 검색어(앞뒤 공백 없음). 비었으면 거르지 않는다 */
  q: string;
  scope: AgoraSearchScope;
}

/** 주소 쿼리(?q=…&in=creator)를 검색 상태로 읽는다. in 이 없거나 모르는 값이면 project. */
export function parseAgoraSearch(params: URLSearchParams): AgoraSearch {
  const scope = params.get('in');
  return {
    q: (params.get('q') ?? '').trim(),
    scope: AGORA_SEARCH_SCOPES.find((s) => s === scope) ?? 'project',
  };
}

/** 검색 상태를 쿼리 문자열로 쓴다. 검색어가 비면 쿼리가 없고, 기본 대상(project)은 in 을 생략한다. */
export function agoraSearchQuery(search: AgoraSearch): string {
  const params = new URLSearchParams();
  const q = search.q.trim();
  if (q === '') return '';
  params.set('q', q);
  if (search.scope !== 'project') params.set('in', search.scope);
  return `?${params.toString()}`;
}

/** 지금 주소의 아고라 검색 상태 */
export function useAgoraSearch(): AgoraSearch {
  const [params] = useSearchParams();
  return parseAgoraSearch(params);
}

/** 글자에 검색어가 들어 있는지(대소문자 무시). 검색어가 비면 항상 true. */
export function matchesQuery(text: string, q: string): boolean {
  const needle = q.trim().toLocaleLowerCase();
  return needle === '' || text.toLocaleLowerCase().includes(needle);
}
