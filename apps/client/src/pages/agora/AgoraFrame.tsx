import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { AppHeader, type AgoraSearch } from '../../shared/ui';

/**
 * 아고라 화면 틀: 바깥 레이아웃 여백을 지우고 위에 공통 헤더(AGORA 쪽 진하게)를 둔다.
 * 좌우 여백은 화면마다 다르다(홈 18, 상세·핫토픽 21)라서 안쪽 내용이 직접 둔다.
 * isolate: 상세의 큰 그림을 헤더 뒤(음수 쌓임)에 깔아도 화면 배경 아래로 숨지 않게 한다.
 */
export function AgoraFrame({ children, busy }: { children: ReactNode; busy?: boolean }) {
  const me = useQuery({ queryKey: ['me'], queryFn: api.getMe });
  const profileTo = me.data ? `/creators/${encodeURIComponent(me.data.creator.id)}` : '/';
  return (
    <div
      className="relative isolate -m-[var(--space-padding-8)] min-h-screen"
      aria-busy={busy || undefined}
    >
      <AppHeader
        current="agora"
        profileTo={profileTo}
        avatarUrl={me.data?.creator.avatarUrl ?? null}
      />
      {children}
    </div>
  );
}

/**
 * 검색 결과 수 알림. 검색어가 있을 때만 말하고, 결과가 없으면 눈에도 보이는 "No results."(AGS-01)가 된다.
 * 낭독기가 바뀐 결과를 알리도록 요소는 항상 둔다(검색어가 없으면 비어 있다).
 */
export function SearchStatus({ search, count }: { search: AgoraSearch; count: number }) {
  const searching = search.q !== '';
  const empty = searching && count === 0;
  return (
    <p
      role="status"
      className={
        empty
          ? 'm-0 py-[var(--space-agora-bottom)] text-center [font:var(--text-body-b1-r)] text-[color:var(--color-font-sub-text)]'
          : 'sr-only'
      }
    >
      {!searching ? '' : empty ? COPY['AGS-01'] : `${COPY['AGS-02']}: ${count}`}
    </p>
  );
}
