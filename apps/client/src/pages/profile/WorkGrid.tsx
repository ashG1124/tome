import type { ProjectSummary } from '@tome/shared';
import { Link } from 'react-router';
import { COPY, type CopyKey } from '../../shared/copy';
import { ApiPhoto, Icon, ShelfGrid } from '../../shared/ui';

interface WorkGridProps {
  works: readonly ProjectSummary[];
  /** 내 프로필이면 true: 카드를 누르면 내 워크스페이스로, 아니면 아고라 상세(읽기 전용)로 간다 */
  mine: boolean;
  /** 바깥 자리(최소 높이 등). 격자 무늬는 이 높이만큼 깔린다 */
  className?: string;
}

/** 카드 종류별 글리프(홈 서가와 같은 브랜드 그림) */
function glyphOf(project: ProjectSummary): { icon: string; label: CopyKey } {
  if (project.kind === 'derive') return { icon: 'card-stack', label: 'H-03c' };
  if (project.remixPartner !== undefined) return { icon: 'card-remix', label: 'H-03b' };
  return { icon: 'card-mywork', label: 'H-03a' };
}

/**
 * 게시작 카드 한 장(Home Thumanail 4181:35062, 108×192). 표지 사진 위 왼쪽 위를 어둡게 깔고
 * 종류 글리프와 Posted 태그를 올린다. 카드 전체가 링크이고, 링크 이름은 제목이다.
 */
function WorkCard({ project, mine }: { project: ProjectSummary; mine: boolean }) {
  const glyph = glyphOf(project);
  const to = mine
    ? `/projects/${encodeURIComponent(project.id)}`
    : `/agora/projects/${encodeURIComponent(project.id)}`;
  return (
    <Link
      to={to}
      className={[
        'relative isolate box-border flex h-[var(--size-shelf-card-height)] w-[var(--size-shelf-card-width)] overflow-hidden no-underline',
        'rounded-[var(--radius-shelf-card)] bg-[color:var(--color-fill-neutral-weak)] p-[var(--space-padding-4)]',
        'focus-visible:outline-[length:var(--stroke-weight-bold)] focus-visible:outline-offset-[var(--focus-outline-offset)] focus-visible:outline-[color:var(--color-shelf-focus)]',
      ].join(' ')}
    >
      <ApiPhoto
        path={project.coverThumbUrl}
        className="absolute inset-0 -z-20 size-full object-cover"
        fallback={null}
      />
      {project.coverThumbUrl !== null ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(161.77deg,var(--color-shelf-cover-shade)_4.92%,transparent_57.19%)]"
        />
      ) : null}
      <span
        className={[
          'flex w-full items-start justify-between',
          project.coverThumbUrl !== null
            ? 'text-[color:var(--color-font-on-fill)]'
            : 'text-[color:var(--color-font-sub-text)]',
        ].join(' ')}
      >
        <Icon name={glyph.icon} size={20} />
        <span className="sr-only">{COPY[glyph.label]}</span>
        {project.posted ? (
          <span className="rounded-[var(--radius-max)] bg-[color:var(--color-border-default)] px-[var(--space-padding-3)] py-[var(--space-tag-y)] [font:var(--text-tag)] backdrop-blur-[var(--blur-tag)]">
            {COPY['H-02a']}
          </span>
        ) : null}
      </span>
      <span className="sr-only">{project.title}</span>
    </Link>
  );
}

/**
 * Work 탭(4181:34987): 게시작을 서가와 같은 격자(가로 128·세로 212 간격, 칸 모서리마다 + 무늬) 위에 놓는다.
 * 남의 작품을 누르면 아고라 상세(읽기 전용, Derive 유도)로, 내 작품은 워크스페이스로 간다.
 */
export function WorkGrid({ works, mine, className = '' }: WorkGridProps) {
  return (
    <div className={`relative isolate pb-[var(--grid-gutter)] ${className}`}>
      <ShelfGrid />
      {works.length === 0 ? (
        <p className="m-0 px-[var(--grid-gutter)] pt-[var(--grid-gutter)] [font:var(--text-body-b1-r)] text-[color:var(--color-font-sub-text)]">
          {COPY['S-02']}
        </p>
      ) : null}
      <ul
        className={[
          'm-0 grid list-none px-[var(--grid-gutter)] pt-[var(--grid-gutter)] pb-0',
          'grid-cols-[repeat(auto-fill,var(--size-shelf-card-width))] gap-[var(--grid-gutter)]',
        ].join(' ')}
      >
        {works.map((work) => (
          <li key={work.id}>
            <WorkCard project={work} mine={mine} />
          </li>
        ))}
      </ul>
    </div>
  );
}
