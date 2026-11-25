import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { nearestSlot, passedThreshold, previewIndex, slotDelta, type Slot } from './drag';

/** 내려놓은 카드가 제자리로 미끄러져 들어가는 시간(ms). 서가의 다른 전환(250ms)과 맞춘다. */
const LAND_MS = 250;

interface Press {
  index: number;
  pointerId: number;
  x: number;
  y: number;
  scrollX: number;
  scrollY: number;
  element: HTMLElement;
}

interface Drag {
  from: number;
  over: number;
  dx: number;
  dy: number;
  slots: Slot[];
}

/** 내려놓은 카드: 놓은 자리(포인터)에서 새 칸까지 남은 거리. jump 로 그 자리에 그린 뒤 go 에서 0 으로 미끄러진다. */
interface Landing {
  id: string;
  x: number;
  y: number;
  phase: 'jump' | 'go';
}

/** 서가 카드 칸들의 변형 전 자리(offset 좌표라 hover 로 밀린 변형은 빠진다). */
function measureSlots(list: HTMLElement): Slot[] {
  return Array.from(list.querySelectorAll<HTMLElement>(':scope > li[data-project-id]')).map(
    (item) => ({
      x: item.offsetLeft,
      y: item.offsetTop,
      width: item.offsetWidth,
      height: item.offsetHeight,
    }),
  );
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
  /** 보이는 카드 id(서가 순서). */
  ids: readonly string[];
  /** 끌기를 시작할 때(넓어진 카드를 접는다). */
  onStart: () => void;
  /** from 칸의 카드를 to 칸에 내려놓았을 때. */
  onDrop: (from: number, to: number) => void;
}

/**
 * 서가 카드를 포인터로 잡아 옮긴다(HTML 드래그 대신 pointer 이벤트).
 * 기준 거리(DRAG_THRESHOLD)를 넘게 움직여야 끌기가 되고, 그 전에 떼면 평소처럼 클릭(프로젝트 열기)이다.
 * 끄는 동안 다른 카드는 놓일 순서대로 미리 비켜 서고(움직임 줄이기면 바로), Escape 로 취소한다.
 */
export function useShelfDrag({ list, ids, onStart, onDrop }: ShelfDragOptions) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [landing, setLanding] = useState<Landing | null>(null);
  const press = useRef<Press | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  const update = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
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
    const id = ids[current.from];
    const from = current.slots[current.from];
    const target = current.slots[to];
    update(null);
    if (id !== undefined && from !== undefined && target !== undefined && !prefersReducedMotion()) {
      setLanding({
        id,
        x: from.x + current.dx - target.x,
        y: from.y + current.dy - target.y,
        phase: 'jump',
      });
    }
    if (to !== current.from) onDrop(current.from, to);
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

  // 끄는 중 Escape 는 취소(카드는 제자리로).
  useEffect(() => {
    if (drag === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      finish(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const bind = (index: number) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      suppressClick.current = false;
      if (event.button !== 0 || !event.isPrimary || dragRef.current !== null) return;
      press.current = {
        index,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        element: event.currentTarget,
      };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const pressed = press.current;
      if (pressed === null || pressed.pointerId !== event.pointerId) return;
      const dx = event.clientX - pressed.x + window.scrollX - pressed.scrollX;
      const dy = event.clientY - pressed.y + window.scrollY - pressed.scrollY;
      let current = dragRef.current;
      if (current === null) {
        if (!passedThreshold(dx, dy) || list === null) return;
        pressed.element.setPointerCapture?.(event.pointerId);
        onStart();
        current = { from: pressed.index, over: pressed.index, dx, dy, slots: measureSlots(list) };
      }
      const home = current.slots[current.from];
      const over =
        home === undefined
          ? current.over
          : nearestSlot(current.slots, home.x + home.width / 2 + dx, home.y + home.height / 2 + dy);
      update({ ...current, dx, dy, over: over < 0 ? current.over : over });
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

  /** index 칸 카드에 줄 스타일. 끌기·내려놓기 중이 아니면 null(평소 hover 밀기를 쓴다). */
  const styleFor = (index: number, id: string): CSSProperties | null => {
    if (drag !== null) {
      if (index === drag.from) {
        return {
          transform: translate(drag.dx, drag.dy),
          transition: 'none',
          position: 'relative',
          zIndex: 20,
        };
      }
      const delta = slotDelta(drag.slots, index, previewIndex(index, drag.from, drag.over));
      return delta.x === 0 && delta.y === 0 ? {} : { transform: translate(delta.x, delta.y) };
    }
    if (landing !== null) {
      // jump 순간에는 모두 전환을 끄고(새 순서로 바뀐 자리에서 튀지 않게), go 에서 놓은 카드만 미끄러진다.
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
    /** 끌고 있는 카드의 칸 번호(없으면 null). */
    draggingIndex: drag?.from ?? null,
    bind,
    styleFor,
  };
}
