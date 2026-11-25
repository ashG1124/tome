import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { cellAt, cellDelta, cellOrigin, passedThreshold, type GridMetrics } from './drag';
import { lastRow, MAX_ROWS, sameCell, type Cell, type CellMap } from './freeLayout';

/** 내려놓은 카드가 제자리로 미끄러져 들어가는 시간(ms). 서가의 다른 전환(250ms)과 맞춘다. */
const LAND_MS = 250;

interface Press {
  id: string;
  pointerId: number;
  x: number;
  y: number;
  scrollX: number;
  scrollY: number;
  /** 마지막 포인터 자리(끄는 중 화면을 굴려도 다시 계산한다) */
  lastX: number;
  lastY: number;
  element: HTMLElement;
}

interface Drag {
  id: string;
  from: Cell;
  over: Cell;
  dx: number;
  dy: number;
  metrics: GridMetrics;
  maxRow: number;
}

/** 내려놓은 카드: 놓은 자리(포인터)에서 새 칸까지 남은 거리. jump 로 그 자리에 그린 뒤 go 에서 0 으로 미끄러진다. */
interface Landing {
  id: string;
  x: number;
  y: number;
  phase: 'jump' | 'go';
}

const px = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** 서가 목록의 격자 치수. 칸 크기는 토큰(--size-shelf-card-*), 간격·여백은 목록 스타일에서 읽는다. */
function measureGrid(list: HTMLElement): GridMetrics {
  const styles = getComputedStyle(list);
  return {
    originX: px(styles.paddingLeft),
    originY: px(styles.paddingTop),
    pitchX: px(styles.getPropertyValue('--size-shelf-card-width')) + px(styles.columnGap),
    pitchY: px(styles.getPropertyValue('--size-shelf-card-height')) + px(styles.rowGap),
  };
}

/** 지금 화면 아래 끝까지 보이는 마지막 줄 번호(서가가 화면보다 짧아도 보이는 빈 자리에 놓을 수 있게). */
function lastVisibleRow(list: HTMLElement, metrics: GridMetrics): number {
  if (metrics.pitchY <= 0) return 0;
  const top = list.getBoundingClientRect().top + metrics.originY;
  return Math.floor((window.innerHeight - top) / metrics.pitchY) - 1;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const translate = (x: number, y: number) => `translate(${x}px, ${y}px)`;

interface ShelfDragOptions {
  /** 서가 목록 요소(카드 li 는 data-project-id 를 가진다). */
  list: HTMLElement | null;
  /** 보이는 카드의 칸 배치. */
  cells: CellMap;
  /** 서가 한 줄의 칸 수. */
  columns: number;
  /** 끌기를 시작할 때(넓어진 카드를 접는다). */
  onStart: () => void;
  /** id 카드를 to 칸에 내려놓았을 때(같은 칸이면 부르지 않는다). */
  onDrop: (id: string, to: Cell) => void;
}

/**
 * 서가 카드를 포인터로 잡아 서가 격자 아무 칸에나 옮긴다(HTML 드래그 대신 pointer 이벤트, #240).
 * 기준 거리(DRAG_THRESHOLD)를 넘게 움직여야 끌기가 되고, 그 전에 떼면 평소처럼 클릭(프로젝트 열기)이다.
 * 끄는 동안 카드는 포인터를 따라가고, 놓일 칸에 자리 표시가 뜬다. 그 칸에 다른 카드가 있으면
 * 그 카드가 끄는 카드의 원래 칸으로 미리 비켜 선다(놓으면 맞바꾼다). Escape 로 취소한다.
 */
export function useShelfDrag({ list, cells, columns, onStart, onDrop }: ShelfDragOptions) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [landing, setLanding] = useState<Landing | null>(null);
  const press = useRef<Press | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  const update = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  /** 마지막 포인터 자리로 끄는 거리와 놓일 칸을 다시 잰다. 아직 기준 거리 전이면 끌기를 시작하지 않는다. */
  const track = () => {
    const pressed = press.current;
    if (pressed === null) return;
    const dx = pressed.lastX - pressed.x + window.scrollX - pressed.scrollX;
    const dy = pressed.lastY - pressed.y + window.scrollY - pressed.scrollY;
    let current = dragRef.current;
    if (current === null) {
      const from = cells.get(pressed.id);
      if (!passedThreshold(dx, dy) || list === null || from === undefined) return;
      pressed.element.setPointerCapture?.(pressed.pointerId);
      onStart();
      const metrics = measureGrid(list);
      const maxRow = Math.min(
        Math.max(lastRow(cells) + 1, lastVisibleRow(list, metrics)),
        MAX_ROWS - 1,
      );
      current = { id: pressed.id, from, over: from, dx, dy, metrics, maxRow };
    }
    const home = cellOrigin(current.metrics, current.from);
    const over = cellAt(current.metrics, home.x + dx, home.y + dy, columns, current.maxRow);
    update({ ...current, dx, dy, over: over ?? current.from });
  };

  /** 끌기를 끝낸다. drop 이면 over 칸에 놓고, 아니면 제자리로 돌려보낸다. */
  const finish = (drop: boolean) => {
    const current = dragRef.current;
    const pressed = press.current;
    press.current = null;
    if (pressed?.element.hasPointerCapture?.(pressed.pointerId)) {
      pressed.element.releasePointerCapture(pressed.pointerId);
    }
    if (current === null) return;
    // 끌기 뒤 따라오는 click 이 링크를 열지 않게 한 번 막는다.
    suppressClick.current = true;
    const to = drop ? current.over : current.from;
    update(null);
    if (!prefersReducedMotion()) {
      const home = cellOrigin(current.metrics, current.from);
      const target = cellOrigin(current.metrics, to);
      setLanding({
        id: current.id,
        x: home.x + current.dx - target.x,
        y: home.y + current.dy - target.y,
        phase: 'jump',
      });
    }
    if (!sameCell(to, current.from)) onDrop(current.id, to);
  };

  // jump 를 그린 다음 프레임에 go 로 바꿔 미끄러지게 하고, 끝나면 지운다.
  useLayoutEffect(() => {
    if (landing === null) return;
    if (landing.phase === 'jump') {
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setLanding({ ...landing, phase: 'go' }));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }
    const timer = window.setTimeout(() => setLanding(null), LAND_MS + 50);
    return () => window.clearTimeout(timer);
  }, [landing]);

  // 끄는 중 Escape 는 취소(카드는 제자리로). 화면을 굴리면 카드가 포인터 밑에 남도록 다시 잰다.
  useEffect(() => {
    if (drag === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      finish(false);
    };
    const onScroll = () => track();
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
    };
  });

  const bind = (id: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      suppressClick.current = false;
      if (event.button !== 0 || !event.isPrimary || dragRef.current !== null) return;
      press.current = {
        id,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        lastX: event.clientX,
        lastY: event.clientY,
        element: event.currentTarget,
      };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const pressed = press.current;
      if (pressed === null || pressed.pointerId !== event.pointerId) return;
      pressed.lastX = event.clientX;
      pressed.lastY = event.clientY;
      track();
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      if (press.current?.pointerId !== event.pointerId) return;
      finish(true);
    },
    onPointerCancel: () => finish(false),
    onLostPointerCapture: () => {
      if (dragRef.current !== null && press.current !== null) finish(true);
    },
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  });

  /** id 카드에 줄 스타일. 끌기·내려놓기 중이 아니면 null(평소 hover 밀기를 쓴다). */
  const styleFor = (id: string): CSSProperties | null => {
    if (drag !== null) {
      if (id === drag.id) {
        return {
          transform: translate(drag.dx, drag.dy),
          transition: 'none',
          position: 'relative',
          zIndex: 20,
        };
      }
      // 놓일 칸에 있던 카드는 끄는 카드의 원래 칸으로 미리 비켜 선다(맞바꾸기).
      const cell = cells.get(id);
      if (cell !== undefined && sameCell(cell, drag.over) && !sameCell(drag.over, drag.from)) {
        const delta = cellDelta(drag.metrics, drag.over, drag.from);
        return { transform: translate(delta.x, delta.y) };
      }
      return {};
    }
    if (landing !== null) {
      // jump 순간에는 모두 전환을 끄고(새 칸으로 바뀐 자리에서 튀지 않게), go 에서 놓은 카드만 미끄러진다.
      if (id !== landing.id) return landing.phase === 'jump' ? { transition: 'none' } : {};
      return landing.phase === 'jump'
        ? {
            transform: translate(landing.x, landing.y),
            transition: 'none',
            position: 'relative',
            zIndex: 20,
          }
        : {
            transition: `transform ${LAND_MS}ms ease-out`,
            position: 'relative',
            zIndex: 20,
          };
    }
    return null;
  };

  return {
    /** 끌고 있는 카드 id(없으면 null). */
    draggingId: drag?.id ?? null,
    /** 끄는 카드가 놓일 칸(끄는 중이 아니면 null). */
    overCell: drag?.over ?? null,
    bind,
    styleFor,
  };
}
