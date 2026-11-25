import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY, SKELETON_COPY } from '../../shared/copy';
import { AppHeader, ErrorNotice, Flash, Icon, ShelfGrid, type FlashKind } from '../../shared/ui';
import { FLASH_MS, flashFromState } from './flash';
import {
  BASE_COLUMNS,
  lastRow,
  MAX_ROWS,
  placeCard,
  planShelfWrites,
  pushShifts,
  readingOrder,
  readLayout,
  resolveLayout,
  sameCell,
  stepCell,
  writeLayout,
  type Cell,
  type CellMap,
  type MoveDirection,
} from './freeLayout';
import { columnsFor, OPEN_CARD_SPAN, opensToLeft, pushStyle } from './layout';
import { NewProjectCell } from './NewProjectCell';
import { RecentWork } from './RecentWork';
import { ShelfCard } from './ShelfCard';
import { applyOrder, hasWork, latestEdited, sortShelf } from './shelf';
import { useShelfDrag } from './useShelfDrag';

/**
 * 서가 한 줄의 칸 수를 잰다. 창 크기가 바뀌면 다시 잰다. 재지 못하면(첫 그리기 전·테스트) 기준 화면 칸 수.
 * 서가 목록은 데이터가 온 뒤에 그려지므로, 요소가 생기는 순간을 알 수 있게 ref 대신 요소 자체를 받는다.
 * CSS 격자(auto-fill)와 같게 안쪽 여백을 뺀 폭으로 센다.
 */
function useShelfColumns(element: HTMLElement | null): number {
  const [columns, setColumns] = useState(BASE_COLUMNS);
  useLayoutEffect(() => {
    if (element === null) return;
    const measure = () => {
      const styles = getComputedStyle(element);
      const cell = Number.parseFloat(styles.getPropertyValue('--size-shelf-card-width'));
      if (!(cell > 0)) return;
      const gap = Number.parseFloat(styles.columnGap) || 0;
      const padding =
        (Number.parseFloat(styles.paddingLeft) || 0) +
        (Number.parseFloat(styles.paddingRight) || 0);
      setColumns(columnsFor(element.clientWidth - padding, cell, gap));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return columns;
}

/**
 * 만든 사람별로 이 브라우저에 저장해 둔 카드 자리(#240). 서버에 칸 좌표를 둘 곳이 없어 localStorage 에 둔다.
 * 옮기면 화면 자리를 바로 바꾸고 저장한다.
 */
function useSavedLayout(
  creatorId: string | null,
): [CellMap, (next: CellMap, known: ReadonlySet<string>) => void] {
  const stored = useMemo(() => readLayout(creatorId), [creatorId]);
  const [changed, setChanged] = useState<{ owner: string | null; cells: CellMap } | null>(null);
  const cells = changed !== null && changed.owner === creatorId ? changed.cells : stored;
  const save = (next: CellMap, known: ReadonlySet<string>) => {
    setChanged({ owner: creatorId, cells: next });
    writeLayout(creatorId, next, known);
  };
  return [cells, save];
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
  const creatorId = me.data?.creator.id ?? null;
  // 화면에서 바꾼 순서(서가 전체 id 목록, 숨긴 빈 프로젝트 포함). 없으면 서버가 준 서가 순서를 쓴다.
  const [order, setOrder] = useState<readonly string[] | null>(null);
  const [saved, setSaved] = useSavedLayout(creatorId);
  const [saveFailed, setSaveFailed] = useState(false);
  // 서버 순서 저장을 차례대로 보낸다(앞 저장이 끝난 뒤 다음 저장).
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  // 옮긴 뒤 낭독할 문장(role=status)과, 키보드로 옮긴 뒤 포커스를 돌려줄 카드 id
  const [moveNotice, setMoveNotice] = useState('');
  const refocusId = useRef<string | null>(null);
  const hintId = useId();
  // 넓어진 카드(마우스·키보드 포커스) id. 같은 줄에서 바로 뒤에 붙은 카드를 오른쪽으로 민다.
  const [openId, setOpenId] = useState<string | null>(null);
  const [list, setList] = useState<HTMLOListElement | null>(null);
  const columns = useShelfColumns(list);

  const all = applyOrder(sortShelf(projects.data?.projects ?? []), order);
  // 아무 작업도 하지 않은(확정 답변이 없는) 프로젝트는 카드를 만들지 않는다(#227).
  const shelf = all.filter(hasWork);
  const ids = shelf.map((project) => project.id);
  // 카드 자리(#240): 저장한 칸, 없으면 서가 순서대로 첫 빈 칸. 목록은 읽는 순서로 그려 Tab 순서가 화면과 같다.
  const cells = resolveLayout(ids, saved, columns);
  const byId = new Map(shelf.map((project) => [project.id, project]));
  const visible = readingOrder(cells).flatMap((id) => {
    const project = byId.get(id);
    return project === undefined ? [] : [project];
  });
  const bottomRow = lastRow(cells);
  // 내 정보를 받은 뒤에 그린다(저장한 자리를 읽기 전 자동 배치가 잠깐 보였다 바뀌지 않게).
  const ready = projects.data !== undefined && !me.isPending;

  // id 카드를 target 칸에 놓는다(빈 칸이면 옮기고, 다른 카드가 있으면 맞바꾼다).
  // 화면 자리를 먼저 바꿔 이 브라우저에 저장하고, 서버에는 읽는 순서를 서가 순서로 저장한다.
  // 서버 저장이 실패하면 자리·순서를 되돌리고 E-03 을 보여 준다.
  const moveTo = (id: string, target: Cell, refocus = false) => {
    const next = placeCard(cells, id, target);
    if (next === cells) return;
    const before = saved;
    const fullBefore = all.map((project) => project.id);
    const nextSaved = new Map<string, Cell>();
    for (const cardId of ids) {
      const now = next.get(cardId);
      const was = cells.get(cardId);
      if (now === undefined || was === undefined) continue;
      // 움직인 카드와 아직 자리가 없던 카드는 지금 칸을, 나머지는 저장한 칸(좁은 폭에서 당겨진 원래 칸)을 남긴다.
      const keep = saved.get(cardId);
      nextSaved.set(cardId, !sameCell(was, now) || keep === undefined ? now : keep);
    }
    setSaved(nextSaved, new Set(fullBefore));

    const { order: full, writes } = planShelfWrites(fullBefore, ids, readingOrder(next), id);
    setOrder(full);
    setSaveFailed(false);
    setMoveNotice(
      COPY['H-06']
        .replace('{row}', String(target.row + 1))
        .replace('{column}', String(target.col + 1)),
    );
    refocusId.current = refocus ? id : null;
    // 넓어진 카드도 옮긴 카드를 따라간다(포커스는 그대로라 onFocus 가 다시 오지 않는다).
    setOpenId(refocus ? id : null);
    if (writes.length === 0) return;
    saving.current = saving.current
      .then(async () => {
        for (const [moved, position] of writes) {
          await api.updateProject(moved, { shelfPosition: position });
        }
      })
      .catch(() => {
        setOrder(fullBefore);
        setSaved(before, new Set(fullBefore));
        setSaveFailed(true);
      });
  };

  const moveBy = (id: string, direction: MoveDirection) => {
    const from = cells.get(id);
    if (from === undefined) return;
    const target = stepCell(from, direction, columns, Math.min(bottomRow + 1, MAX_ROWS - 1));
    if (target !== null) moveTo(id, target, true);
  };

  const drag = useShelfDrag({
    list,
    cells,
    columns,
    onStart: () => setOpenId(null),
    onDrop: (id, to) => moveTo(id, to),
  });

  // 키보드로 옮기면 카드 자리가 바뀌며 포커스가 빠질 수 있어 그 카드 링크로 되돌린다.
  useLayoutEffect(() => {
    const id = refocusId.current;
    if (id === null || list === null) return;
    refocusId.current = null;
    const link = list.querySelector<HTMLElement>(`li[data-project-id="${id}"] a`);
    if (link !== null && document.activeElement !== link) link.focus();
  });

  const openCell = openId === null ? undefined : cells.get(openId);
  const shifts = pushShifts(
    cells,
    openCell === undefined ? null : openId,
    OPEN_CARD_SPAN,
    openCell !== undefined && opensToLeft(openCell.col, columns),
  );

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
        aria-busy={projects.isPending || me.isPending || undefined}
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
          {drag.overCell !== null ? (
            // 끄는 카드가 놓일 칸 자리 표시(격자에 붙는다). 장식이라 낭독기에서 숨긴다.
            <div
              aria-hidden="true"
              data-shelf-drop=""
              className={[
                'pointer-events-none absolute box-border h-[var(--size-shelf-card-height)] w-[var(--size-shelf-card-width)]',
                'rounded-[var(--radius-shelf-card)] border-[length:var(--stroke-weight-default)] border-dashed border-[color:var(--color-shelf-focus)]',
              ].join(' ')}
              style={{
                left: `calc(var(--grid-gutter) + (var(--size-shelf-card-width) + var(--grid-gutter)) * ${drag.overCell.col})`,
                top: `calc(var(--grid-gutter) + (var(--size-shelf-card-height) + var(--grid-gutter)) * ${drag.overCell.row})`,
              }}
            />
          ) : null}
          {ready ? (
            <ol
              ref={setList}
              className={[
                'm-0 grid list-none px-[var(--grid-gutter)] pt-[var(--grid-gutter)] pb-0',
                'grid-cols-[repeat(auto-fill,var(--size-shelf-card-width))] gap-[var(--grid-gutter)]',
              ].join(' ')}
              // 마지막 카드 줄 아래에 빈 줄 하나를 더 둬서, 카드를 더 아래에 놓으면 서가가 늘어난다(스크롤).
              style={{
                gridTemplateRows: `repeat(${shelf.length > 0 ? bottomRow + 2 : 1}, minmax(var(--size-shelf-card-height), auto))`,
              }}
            >
              <li style={{ gridColumnStart: 1, gridRowStart: 1 }}>
                <NewProjectCell onCreate={() => api.createProject({}).then((r) => r.project.id)} />
              </li>
              {visible.map((project) => {
                const cell = cells.get(project.id) as Cell;
                const dragging = drag.draggingId !== null;
                const lifted = drag.draggingId === project.id;
                return (
                  <li
                    key={project.id}
                    data-project-id={project.id}
                    data-cell={`${cell.col},${cell.row}`}
                    {...drag.bind(project.id)}
                    onMouseEnter={() => {
                      if (!dragging) setOpenId(project.id);
                    }}
                    onMouseLeave={() => setOpenId((value) => (value === project.id ? null : value))}
                    onFocus={() => {
                      if (!dragging) setOpenId(project.id);
                    }}
                    onBlur={() => setOpenId((value) => (value === project.id ? null : value))}
                    style={{
                      gridColumnStart: cell.col + 1,
                      gridRowStart: cell.row + 1,
                      ...(drag.styleFor(project.id) ??
                        pushStyle(shifts.get(project.id) ?? 0, cell.col, columns)),
                    }}
                    className={[
                      // 누른 채 끌 때 글자가 선택되지 않게 하고, 끄는 동안은 잡은 손 모양
                      'select-none',
                      lifted ? 'cursor-grabbing' : '',
                      'motion-safe:transition-[transform,opacity] motion-safe:duration-[250ms] motion-safe:ease-out',
                    ].join(' ')}
                  >
                    <ShelfCard
                      project={project}
                      openToLeft={opensToLeft(cell.col, columns)}
                      lifted={lifted}
                      describedBy={hintId}
                      onMove={(direction) => moveBy(project.id, direction)}
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
          {ready && shelf.length === 0 ? (
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
