import { useRef, type DragEvent, type MouseEvent, type PointerEvent } from 'react';

/** 누른 채 이만큼(px) 넘게 움직여야 끌기로 본다. 그보다 적게 움직이고 떼면 클릭(카드 열기)이다. */
export const DRAG_SCROLL_THRESHOLD = 6;

interface Press {
  pointerId: number;
  startX: number;
  startLeft: number;
  dragging: boolean;
}

/**
 * 가로로 넘치는 줄을 마우스로 잡아끌어 옮긴다(Shift+휠을 모르는 사람이 많다).
 * 돌려준 처리기를 스크롤되는 요소에 그대로 펼쳐 넣는다. 끄는 동안 요소에 data-dragging 이 붙는다.
 * - 마우스 왼쪽 버튼만 받는다. 터치·펜은 브라우저가 원래대로 스크롤한다.
 * - 끈 뒤에 따라오는 클릭은 막아서 카드 링크가 열리지 않는다. 거의 움직이지 않고 떼면 평소처럼 눌린다.
 * - 링크·그림을 브라우저가 따로 끌어가면(dragstart) 포인터 움직임이 끊기므로 막는다.
 */
export function useDragScroll<T extends HTMLElement>() {
  const press = useRef<Press | null>(null);
  const dragged = useRef(false);

  const finish = (event: PointerEvent<T>) => {
    const current = press.current;
    if (!current || current.pointerId !== event.pointerId) return;
    press.current = null;
    if (!current.dragging) return;
    // 떼자마자 오는 클릭 한 번만 막는다. 클릭이 오지 않았으면(줄 밖에서 뗌) 다음 키보드 Enter 까지 막지 않게 바로 푼다.
    dragged.current = true;
    window.setTimeout(() => (dragged.current = false), 0);
    const element = event.currentTarget;
    element.removeAttribute('data-dragging');
    if (element.hasPointerCapture?.(event.pointerId))
      element.releasePointerCapture(event.pointerId);
  };

  return {
    onPointerDown: (event: PointerEvent<T>) => {
      dragged.current = false;
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      press.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startLeft: event.currentTarget.scrollLeft,
        dragging: false,
      };
    },
    onPointerMove: (event: PointerEvent<T>) => {
      const current = press.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const dx = event.clientX - current.startX;
      const element = event.currentTarget;
      if (!current.dragging) {
        if (Math.abs(dx) <= DRAG_SCROLL_THRESHOLD) return;
        current.dragging = true;
        element.setAttribute('data-dragging', '');
        // 줄 밖으로 나가도 계속 끌리게 포인터를 붙잡는다.
        element.setPointerCapture?.(event.pointerId);
      }
      element.scrollLeft = current.startLeft - dx;
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onClickCapture: (event: MouseEvent<T>) => {
      if (!dragged.current) return;
      dragged.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onDragStart: (event: DragEvent<T>) => event.preventDefault(),
  };
}
