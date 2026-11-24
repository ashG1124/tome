import type { ReactNode } from 'react';

/**
 * 아고라 구역(Content Feed 5170:135848): 제목 24 SemiBold + 간격 12 + 목록. 왼쪽 18 에서 시작한다.
 * 홈(Project 탭)의 가로 줄과 Creator 탭의 칸 목록이 같이 쓴다. 목록 모양은 children 이 정한다.
 */
export function AgoraSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-[var(--space-gap-4)] pl-[var(--space-agora-content-x)]"
    >
      <h2
        id={id}
        className="m-0 [font:var(--text-heading-h1)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-strong)]"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
