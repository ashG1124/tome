import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from '../../shared/api';
import { AppHeader } from '../../shared/ui';

/** 아고라 화면 틀: 바깥 레이아웃 여백을 지우고 위에 공통 헤더(AGORA 쪽 진하게)를 둔다. */
export function AgoraFrame({ children, busy }: { children: ReactNode; busy?: boolean }) {
  const me = useQuery({ queryKey: ['me'], queryFn: api.getMe });
  const profileTo = me.data ? `/creators/${encodeURIComponent(me.data.creator.id)}` : '/';
  return (
    <div className="-m-[var(--space-padding-8)] min-h-screen" aria-busy={busy || undefined}>
      <AppHeader current="agora" profileTo={profileTo} />
      <div className="px-[var(--space-header-x)] pb-[var(--space-agora-section)]">{children}</div>
    </div>
  );
}
