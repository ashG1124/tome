import type { ProjectSummary } from '@tome/shared';
import type { KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { Icon } from '../../shared/ui';
import { formatEditedDate, shelfCardType, type ShelfCardType } from './shelf';

/** 카드 종류별 글리프 이름(브랜드 그림 파일). */
const TYPE_GLYPH: Record<ShelfCardType, string> = {
  'my-work': 'glyph-mywork',
  remix: 'glyph-remix',
  derive: 'glyph-derive',
};

/** 홈 화면의 보조 아이콘 크기(아이콘 사이징 원칙의 20). 크기 토큰이 생기면 바꾼다. */
const GLYPH_SIZE = 20;

interface ShelfCardProps {
  project: ProjectSummary;
  /** 키보드로 순서를 한 칸 앞(-1)·뒤(+1)로 옮긴다. */
  onMove: (step: -1 | 1) => void;
}

/**
 * 서가 카드 한 장. 링크에는 제목만 넣어 화면 낭독기가 제목으로 읽게 한다.
 * Alt+←/→ 로 순서를 바꾼다(드래그의 키보드 대체 경로).
 */
export function ShelfCard({ project, onMove }: ShelfCardProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (!event.altKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      onMove(event.key === 'ArrowLeft' ? -1 : 1);
    }
  };

  return (
    <div
      className={[
        'box-border flex h-full flex-col gap-[var(--space-padding-3)]',
        'rounded-[var(--radius-1)] bg-[color:var(--color-fill-neutral-weak)] p-[var(--space-padding-4)]',
      ].join(' ')}
    >
      <span className="text-[color:var(--color-font-strong)]">
        <Icon name={TYPE_GLYPH[shelfCardType(project)]} size={GLYPH_SIZE} />
      </span>
      <Link
        to={`/projects/${project.id}`}
        onKeyDown={handleKeyDown}
        className={[
          'line-clamp-3 break-words no-underline',
          '[font:var(--text-subtitle-st2-sb)] tracking-[var(--letter-spacing-default)]',
          'text-[color:var(--color-font-strong)]',
        ].join(' ')}
      >
        {project.title}
      </Link>
      <time
        dateTime={project.lastEditedAt}
        className="mt-auto [font:var(--text-body-b2-r)] text-[color:var(--color-font-sub-text)]"
      >
        {formatEditedDate(project.lastEditedAt)}
      </time>
    </div>
  );
}
