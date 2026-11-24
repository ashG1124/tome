import type { ProjectSummary } from '@tome/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { COPY } from '../../shared/copy';
import { Icon } from '../../shared/ui';
import './recent-work.css';
import { formatEditedDate } from './shelf';

const BUTTON_BASE = [
  'flex h-[var(--size-icon-menu-button)] items-center rounded-[var(--radius-max)]',
  'border border-solid border-[length:var(--stroke-weight-light)] border-[color:var(--color-fill-card)]',
  'bg-[color:var(--color-fill-neutral-weak)] shadow-[var(--shadow-icon-menu)] cursor-pointer',
  'text-[color:var(--color-fill-neutral)] [font:var(--text-body-b1-m)] tracking-[var(--letter-spacing-body-b1)]',
].join(' ');

/**
 * 홈 좌하단 Recent Work. 닫혀 있을 땐 시계 알약, 누르면 위로 카드가 열려 가장 최근 편집한 프로젝트 제목·편집일과
 * 노란 ↗ 열기 링크가 보인다. Escape 로 닫고 포커스는 버튼으로 돌아온다.
 */
export function RecentWork({ project }: { project: ProjectSummary }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const cardId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="recent-work fixed bottom-[var(--recent-work-offset-bottom)] left-[var(--recent-work-offset-x)] z-10 flex flex-col items-start gap-[var(--space-gap-5)]">
      {open ? (
        <section
          id={cardId}
          aria-label={COPY['RW-02']}
          className="flex h-[var(--recent-work-card-height)] w-[var(--recent-work-width)] flex-col justify-between rounded-[var(--radius-dialog)] bg-[linear-gradient(-26deg,var(--color-fill-brand-med)_29.6%,var(--color-background-lower)_95.5%)] p-[var(--space-padding-8)] shadow-[var(--shadow-icon-menu)]"
        >
          <div className="flex items-start justify-between pl-[var(--space-padding-3)]">
            <p className="m-0 py-[var(--space-padding-2)] [font:var(--text-body-b1-r)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-sub-text)]">
              {COPY['RW-02']}
            </p>
            <Link
              to={`/projects/${encodeURIComponent(project.id)}`}
              aria-label={`${COPY['RW-01']}: ${project.title}`}
              className="flex size-[var(--recent-work-open-size)] items-center justify-center rounded-[var(--radius-max)] bg-[color:var(--color-fill-brand)] text-[color:var(--color-font-main-text)]"
            >
              <Icon name="arrow-outward" size={32} />
            </Link>
          </div>
          <div className="flex flex-col gap-[var(--space-recent-work-body-gap)] p-[var(--space-padding-3)]">
            <h2 className="m-0 line-clamp-2 [font:var(--text-heading-h1)] tracking-[var(--letter-spacing-heading-h1)] break-words text-[color:var(--color-font-main-text)]">
              {project.title}
            </h2>
            <p className="m-0 flex items-center gap-[var(--space-gap-1)] [font:var(--text-body-b1-r)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-sub-text)]">
              <Icon name="history" size={24} />
              {COPY['H-04']} {formatEditedDate(project.lastEditedAt)}
            </p>
          </div>
        </section>
      ) : null}
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        aria-label={open ? COPY['RW-01'] : undefined}
        onClick={() => setOpen((value) => !value)}
        className={[
          BUTTON_BASE,
          open
            ? 'w-[var(--size-icon-menu-button)] justify-center'
            : 'gap-[var(--space-gap-3)] px-[var(--space-padding-5)]',
        ].join(' ')}
      >
        <Icon name="recent" size={24} />
        {open ? null : <span>{COPY['RW-01']}</span>}
      </button>
    </div>
  );
}
