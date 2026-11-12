import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type DragEvent } from 'react';
import { Navigate } from 'react-router';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY, SKELETON_COPY } from '../../shared/copy';
import { ErrorNotice, Icon } from '../../shared/ui';
import { ShelfCard } from './ShelfCard';
import { applyOrder, moveCard, sortShelf } from './shelf';

export function HomePage() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });
  // 화면에서 바꾼 순서(id 목록). 없으면 서버가 준 서가 순서를 쓴다.
  const [order, setOrder] = useState<readonly string[] | null>(null);
  const dragFrom = useRef<number | null>(null);

  const redirectTo = authRedirectTarget(projects.error);
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  const shelf = applyOrder(sortShelf(projects.data?.projects ?? []), order);

  // 순서 저장(updateProject)은 공용 API가 생기면 여기서 부른다. 지금은 화면 안에서만 바꾼다.
  const reorder = (from: number, to: number) => {
    setOrder(moveCard(shelf, from, to).map((project) => project.id));
  };

  const dropOn = (index: number) => (event: DragEvent<HTMLLIElement>) => {
    event.preventDefault();
    if (dragFrom.current !== null) reorder(dragFrom.current, index);
    dragFrom.current = null;
  };

  return (
    <section
      aria-busy={projects.isPending || undefined}
      className="flex flex-col gap-[var(--space-gap-5)]"
    >
      <h1 className="m-0 [font:var(--text-heading-h1)] text-[color:var(--color-font-strong)]">
        {SKELETON_COPY.home}
      </h1>
      {projects.isError ? (
        <ErrorNotice
          message={COPY[errorCopyKey(projects.error)]}
          onRetry={() => void projects.refetch()}
        />
      ) : null}
      {projects.data && shelf.length === 0 ? (
        <div className="flex flex-col items-center gap-[var(--space-gap-4)] text-[color:var(--color-font-helper-text)]">
          <Icon name="graphic-tome-home" size={32} />
          <p className="m-0 [font:var(--text-body-b1-m)] text-[color:var(--color-font-sub-text)]">
            {COPY['S-01']}
          </p>
        </div>
      ) : null}
      {shelf.length > 0 ? (
        <ol
          className={[
            'm-0 grid list-none p-0',
            'grid-cols-[repeat(var(--grid-columns-horizontal),minmax(0,1fr))] gap-[var(--grid-gutter)]',
          ].join(' ')}
        >
          {shelf.map((project, index) => (
            <li
              key={project.id}
              draggable
              onDragStart={(event) => {
                dragFrom.current = index;
                event.dataTransfer?.setData('text/plain', project.id);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={dropOn(index)}
            >
              <ShelfCard project={project} onMove={(step) => reorder(index, index + step)} />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
