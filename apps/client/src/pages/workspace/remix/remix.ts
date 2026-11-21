import type { RemixCandidate } from '@tome/shared';

export type RemixTab = 'rising' | 'favorite';

export const REMIX_TABS: readonly RemixTab[] = ['rising', 'favorite'];

/** 탭 이름(RX-02 Rising · RX-03 Favorite) */
export const REMIX_TAB_LABEL = { rising: 'RX-02', favorite: 'RX-03' } as const;

export type CandidateListState =
  | { kind: 'loading' }
  /** 0명이거나 못 받았으면 S-04 를 보여 주고, 리믹스 없이 일반 생성으로 이어 간다. */
  | { kind: 'empty' }
  | { kind: 'list'; creators: readonly RemixCandidate[] };

/** 후보 목록 요청의 상태를 화면에 그릴 모양으로 바꾼다. 실패도 0명과 같이 S-04 로 보여 준다. */
export function candidateListState(query: {
  isPending: boolean;
  isError: boolean;
  data: { creators: readonly RemixCandidate[] } | undefined;
}): CandidateListState {
  if (query.isError) return { kind: 'empty' };
  if (query.isPending || query.data === undefined) return { kind: 'loading' };
  if (query.data.creators.length === 0) return { kind: 'empty' };
  return { kind: 'list', creators: query.data.creators };
}

/** 이름 머리글자(사진이 없을 때 동그라미 안에 쓴다). 빈 이름이면 빈 문자열. */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '';
}
