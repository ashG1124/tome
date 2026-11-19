import type { ProjectSummary } from '@tome/shared';

interface WorkGridProps {
  works: readonly ProjectSummary[];
}

/**
 * Work 탭: 게시작 목록. 표지 그림(없으면 빈 칸)과 제목. 남의 작품 열람·Derive 는 아고라(T9)에서 붙인다.
 * 태그(Posted·Finished) 글자는 홈 서가(#23)의 문구 ID가 정해지면 같이 쓴다.
 */
export function WorkGrid({ works }: WorkGridProps) {
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(var(--grid-columns-horizontal),minmax(0,1fr))] gap-[var(--grid-gutter)] p-0">
      {works.map((work) => (
        <li key={work.id} className="flex flex-col gap-[var(--space-padding-3)]">
          <div className="aspect-[9/16] overflow-hidden rounded-[var(--radius-1)] bg-[color:var(--color-fill-card)]">
            {work.coverThumbUrl !== null ? (
              <img src={work.coverThumbUrl} alt="" className="size-full object-cover" />
            ) : null}
          </div>
          <span className="line-clamp-2 [font:var(--text-body-b2-m)] text-[color:var(--color-font-main-text)]">
            {work.title}
          </span>
        </li>
      ))}
    </ul>
  );
}
