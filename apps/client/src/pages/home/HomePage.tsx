import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY, SKELETON_COPY } from '../../shared/copy';
import { AppHeader, ErrorNotice, Flash, Icon, ShelfGrid, type FlashKind } from '../../shared/ui';
import { FLASH_MS, flashFromState } from './flash';
import { columnsFor, opensToLeft, pushStyle } from './layout';
import { NewProjectCell } from './NewProjectCell';
import { RecentWork } from './RecentWork';
import { ShelfCard } from './ShelfCard';
import {
  applyOrder,
  fullShelfPosition,
  hasWork,
  latestEdited,
  moveCard,
  placeAt,
  sortShelf,
} from './shelf';
import { useShelfDrag } from './useShelfDrag';

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
  // 화면에서 바꾼 순서(서가 전체 id 목록, 숨긴 빈 프로젝트 포함). 없으면 서버가 준 서가 순서를 쓴다.
  const [order, setOrder] = useState<readonly string[] | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  // 옮긴 뒤 낭독할 문장(role=status)과, 키보드로 옮긴 뒤 포커스를 돌려줄 카드 id
  const [moveNotice, setMoveNotice] = useState('');
  const refocusId = useRef<string | null>(null);
  const hintId = useId();
  // 넓어진 카드(마우스·키보드 포커스)의 서가 번호. 같은 줄에서 그 뒤 카드를 오른쪽으로 민다.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [list, setList] = useState<HTMLOListElement | null>(null);
  const columns = useShelfColumns(list);

  const all = applyOrder(sortShelf(projects.data?.projects ?? []), order);
  // 아무 작업도 하지 않은(확정 답변이 없는) 프로젝트는 카드를 만들지 않는다(#227).
  const shelf = all.filter(hasWork);
  const ids = shelf.map((project) => project.id);

  // 화면 순서를 먼저 바꾸고 저장한다. 저장이 실패하면 원래 자리로 되돌리고 E-03 을 보여 준다.
  // 서버 순번은 숨긴 빈 프로젝트까지 센 전체 순번이라, 보이는 순서를 전체 순번으로 바꿔 보낸다.
  const reorder = (from: number, to: number, refocus = false) => {
    if (from === to || to < 0 || to >= shelf.length) return;
    const next = moveCard(ids, from, to);
    const moved = next[to];
    if (moved === undefined) return;
    const fullIds = all.map((project) => project.id);
    const target = fullShelfPosition(fullIds, next, moved);
    setOrder(placeAt(fullIds, moved, target));
    setSaveFailed(false);
    setMoveNotice(
      COPY['H-06'].replace('{position}', String(to + 1)).replace('{total}', String(shelf.length)),
    );
    refocusId.current = refocus ? moved : null;
    // 넓어진 카드 번호도 옮긴 자리로 따라간다(포커스는 그대로라 onFocus 가 다시 오지 않는다).
    setOpenIndex(refocus ? to : null);
    api.updateProject(moved, { shelfPosition: target }).catch(() => {
      setOrder(fullIds);
      setSaveFailed(true);
    });
  };

  const drag = useShelfDrag({
    list,
    ids,
    onStart: () => setOpenIndex(null),
    onDrop: (from, to) => reorder(from, to),
  });

  // 키보드로 옮기면 카드 자리가 바뀌며 포커스가 빠질 수 있어 그 카드 링크로 되돌린다.
  useLayoutEffect(() => {
    const id = refocusId.current;
    if (id === null || list === null) return;
    refocusId.current = null;
    const link = list.querySelector<HTMLElement>(`li[data-project-id="${id}"] a`);
    if (link !== null && document.activeElement !== link) link.focus();
  });

  const redirectTo = authRedirectTarget(projects.error);
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  // Recent Work 는 카드가 없는(작업 전) 프로젝트도 이어서 열 수 있게 전체에서 고른다.
  const recent = latestEdited(all);

  return (
    // 바깥 레이아웃 여백을 지우고 맨 위에 공통 헤더(TÓME 쪽 진하게)를 둔 뒤, 서가가 첫 화면 아래 끝까지 차게 한다
    <div className="-m-[var(--space-padding-8)] flex min-h-[100dvh] flex-col">
      <AppHeader
        current="tome"
        profileTo={profileTo}
        avatarUrl={me.data?.creator.avatarUrl ?? null}
      />
      <section
        aria-busy={projects.isPending || undefined}
        className="flex flex-1 flex-col px-[var(--space-header-x)] pt-[var(--space-shelf-top)]"
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
        <div className="relative isolate flex flex-1 flex-col overflow-x-clip pb-[var(--grid-gutter)]">
          <ShelfGrid />
          {projects.data ? (
            <ol
              ref={setList}
              className={[
                'm-0 grid list-none px-[var(--grid-gutter)] pt-[var(--grid-gutter)] pb-0',
                'grid-cols-[repeat(auto-fill,var(--size-shelf-card-width))] gap-[var(--grid-gutter)]',
              ].join(' ')}
            >
              <li>
                <NewProjectCell onCreate={() => api.createProject({}).then((r) => r.project.id)} />
              </li>
              {shelf.map((project, index) => {
                const dragging = drag.draggingIndex !== null;
                return (
                  <li
                    key={project.id}
                    data-project-id={project.id}
                    {...drag.bind(index)}
                    onMouseEnter={() => {
                      if (!dragging) setOpenIndex(index);
                    }}
                    onMouseLeave={() => setOpenIndex((value) => (value === index ? null : value))}
                    onFocus={() => {
                      if (!dragging) setOpenIndex(index);
                    }}
                    onBlur={() => setOpenIndex((value) => (value === index ? null : value))}
                    style={
                      drag.styleFor(index, project.id) ??
                      pushStyle(index + 1, openIndex === null ? null : openIndex + 1, columns)
                    }
                    className={[
                      // 누른 채 끌 때 글자가 선택되지 않게 하고, 끄는 동안은 잡은 손 모양
                      'select-none',
                      drag.draggingIndex === index ? 'cursor-grabbing' : '',
                      'motion-safe:transition-[transform,opacity] motion-safe:duration-[250ms] motion-safe:ease-out',
                    ].join(' ')}
                  >
                    <ShelfCard
                      project={project}
                      openToLeft={opensToLeft(index + 1, columns)}
                      lifted={drag.draggingIndex === index}
                      rowStep={columns}
                      describedBy={hintId}
                      onMove={(step) =>
                        reorder(index, Math.min(Math.max(index + step, 0), shelf.length - 1), true)
                      }
                    />
                  </li>
                );
              })}
            </ol>
          ) : null}
          {/* 순서 옮기기 키 안내(카드 링크의 설명)와, 옮긴 뒤 낭독하는 자리 */}
          <p id={hintId} hidden>
            {COPY['H-05']}
          </p>
          <p role="status" className="sr-only">
            {moveNotice}
          </p>
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
      {recent ? <RecentWork key={recent.id} project={recent} /> : null}
    </div>
  );
}
