import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY, SKELETON_COPY } from '../../shared/copy';
import { AppHeader, ErrorNotice, Flash, Icon, type FlashKind } from '../../shared/ui';
import { FLASH_MS, flashFromState } from './flash';
import { columnsFor, opensToLeft } from './layout';
import { NewProjectCell } from './NewProjectCell';
import { ShelfCard } from './ShelfCard';
import { ShelfGrid } from './ShelfGrid';
import { applyOrder, moveCard, sortShelf } from './shelf';

/**
 * 서가 한 줄의 칸 수를 잰다. 창 크기가 바뀌면 다시 잰다(ResizeObserver 가 없으면 1칸).
 * 서가 목록은 데이터가 온 뒤에 그려지므로, 요소가 생기는 순간을 알 수 있게 ref 대신 요소 자체를 받는다.
 */
function useShelfColumns(element: HTMLElement | null): number {
  const [columns, setColumns] = useState(1);
  useEffect(() => {
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const styles = getComputedStyle(element);
      const cell = Number.parseFloat(styles.getPropertyValue('--size-shelf-card-width'));
      const gap = Number.parseFloat(styles.columnGap);
      setColumns(columnsFor(element.clientWidth, cell || 0, gap || 0));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return columns;
}

/**
 * 다른 화면이 넘긴 플래시를 잠깐 보여 준다. 새로고침해도 다시 뜨지 않게 주소의 state 는 바로 지운다.
 */
function useHomeFlash(): FlashKind | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [flash, setFlash] = useState<FlashKind | null>(() => flashFromState(location.state));
  useEffect(() => {
    if (flash === null) return;
    void navigate(location.pathname, { replace: true, state: null });
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flash, location.pathname, navigate]);
  return flash;
}

export function HomePage() {
  const flash = useHomeFlash();
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });
  const me = useQuery({ queryKey: ['me'], queryFn: api.getMe });
  const profileTo = me.data ? `/creators/${encodeURIComponent(me.data.creator.id)}` : '/';
  // 화면에서 바꾼 순서(id 목록). 없으면 서버가 준 서가 순서를 쓴다.
  const [order, setOrder] = useState<readonly string[] | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const [list, setList] = useState<HTMLOListElement | null>(null);
  const columns = useShelfColumns(list);

  const redirectTo = authRedirectTarget(projects.error);
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  const shelf = applyOrder(sortShelf(projects.data?.projects ?? []), order);

  // 화면 순서를 먼저 바꾸고 저장한다. 저장이 실패하면 원래 자리로 되돌리고 E-03 을 보여 준다.
  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= shelf.length) return;
    const next = moveCard(shelf, from, to);
    const moved = next[to];
    if (moved === undefined) return;
    const before = shelf.map((project) => project.id);
    setOrder(next.map((project) => project.id));
    setSaveFailed(false);
    api.updateProject(moved.id, { shelfPosition: to }).catch(() => {
      setOrder(before);
      setSaveFailed(true);
    });
  };

  const dropOn = (index: number) => (event: DragEvent<HTMLLIElement>) => {
    event.preventDefault();
    if (dragFrom.current !== null) reorder(dragFrom.current, index);
    dragFrom.current = null;
  };

  return (
    // 바깥 레이아웃 여백을 지우고 맨 위에 공통 헤더(TÓME 쪽 진하게)를 둔 뒤, 서가가 첫 화면 아래 끝까지 차게 한다
    <div className="-m-[var(--space-padding-8)] flex min-h-[100dvh] flex-col">
      <AppHeader current="tome" profileTo={profileTo} />
      <section
        aria-busy={projects.isPending || undefined}
        className="flex flex-1 flex-col gap-[var(--space-gap-5)] px-[var(--space-padding-8)] pb-[var(--space-padding-8)]"
      >
        <h1 className="sr-only">{SKELETON_COPY.home}</h1>
        {/* 플래시: 화면 위 가운데에 떠 있고 내용을 밀지 않는다 */}
        <div className="pointer-events-none fixed top-[var(--space-padding-8)] left-1/2 z-10 -translate-x-1/2">
          <Flash kind={flash} />
        </div>
        {projects.isError ? (
          <ErrorNotice
            message={COPY[errorCopyKey(projects.error)]}
            onRetry={() => void projects.refetch()}
          />
        ) : null}
        {saveFailed ? <ErrorNotice message={COPY['E-03']} /> : null}
        {/* 서가 자리: 남은 높이를 다 쓰고, 뒤에 격자 무늬를 깐 다음 그 위에 카드를 놓는다 */}
        <div className="relative isolate flex flex-1 flex-col gap-[var(--space-gap-5)]">
          <ShelfGrid />
          {projects.data ? (
            <ol
              ref={setList}
              className={[
                'm-0 grid list-none p-0',
                'grid-cols-[repeat(auto-fill,var(--size-shelf-card-width))] gap-[var(--grid-gutter)]',
              ].join(' ')}
            >
              <li>
                <NewProjectCell onCreate={() => api.createProject({}).then((r) => r.project.id)} />
              </li>
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
                  <ShelfCard
                    project={project}
                    openToLeft={opensToLeft(index + 1, columns)}
                    onMove={(step) => reorder(index, index + step)}
                  />
                </li>
              ))}
            </ol>
          ) : null}
          {projects.data && shelf.length === 0 ? (
            <div className="flex flex-col items-center gap-[var(--space-gap-4)] text-[color:var(--color-font-helper-text)]">
              <Icon name="graphic-tome-home" size={32} />
              <p className="m-0 [font:var(--text-body-b1-m)] text-[color:var(--color-font-sub-text)]">
                {COPY['S-01']}
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
