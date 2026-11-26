import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DRAG_SCROLL_THRESHOLD, useDragScroll } from './useDragScroll';

function Row({ onOpen }: { onOpen: () => void }) {
  const dragScroll = useDragScroll<HTMLUListElement>();
  return (
    <ul aria-label="row" {...dragScroll}>
      <li>
        <a
          href="/somewhere"
          onClick={(event) => {
            event.preventDefault();
            onOpen();
          }}
        >
          card
        </a>
      </li>
    </ul>
  );
}

const row = () => screen.getByRole('list', { name: 'row' });
const card = () => screen.getByRole('link', { name: 'card' });
const mouse = (clientX: number, init: PointerEventInit = {}) => ({
  pointerId: 1,
  pointerType: 'mouse',
  button: 0,
  clientX,
  ...init,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDragScroll', () => {
  it('마우스로 잡아끌면 끈 만큼 반대쪽으로 스크롤되고, 끄는 동안 data-dragging 이 붙는다', () => {
    render(<Row onOpen={vi.fn()} />);
    row().scrollLeft = 100;

    fireEvent.pointerDown(card(), mouse(300));
    fireEvent.pointerMove(card(), mouse(300 - DRAG_SCROLL_THRESHOLD));
    // 기준 거리 이하면 아직 끌기가 아니다
    expect(row().scrollLeft).toBe(100);
    expect(row().hasAttribute('data-dragging')).toBe(false);

    fireEvent.pointerMove(card(), mouse(220));
    expect(row().scrollLeft).toBe(180);
    expect(row().hasAttribute('data-dragging')).toBe(true);

    fireEvent.pointerMove(card(), mouse(340));
    expect(row().scrollLeft).toBe(60);

    fireEvent.pointerUp(card(), mouse(340));
    expect(row().hasAttribute('data-dragging')).toBe(false);
  });

  it('끈 뒤에 따라오는 클릭은 카드에 닿지 않는다', () => {
    const onOpen = vi.fn();
    render(<Row onOpen={onOpen} />);

    fireEvent.pointerDown(card(), mouse(300));
    fireEvent.pointerMove(card(), mouse(200));
    fireEvent.pointerUp(card(), mouse(200));
    fireEvent.click(card());

    expect(onOpen).not.toHaveBeenCalled();
  });

  it('거의 움직이지 않고 떼면 평소처럼 카드가 눌린다', () => {
    const onOpen = vi.fn();
    render(<Row onOpen={onOpen} />);

    fireEvent.pointerDown(card(), mouse(300));
    fireEvent.pointerMove(card(), mouse(302));
    fireEvent.pointerUp(card(), mouse(302));
    fireEvent.click(card());

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(row().scrollLeft).toBe(0);
  });

  it('끌고 나서 클릭이 오지 않았으면 다음 클릭(키보드 Enter 등)은 막지 않는다', () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    render(<Row onOpen={onOpen} />);

    fireEvent.pointerDown(card(), mouse(300));
    fireEvent.pointerMove(card(), mouse(200));
    fireEvent.pointerUp(card(), mouse(200));
    vi.runAllTimers();
    fireEvent.click(card());

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('터치와 마우스 오른쪽 버튼으로는 끌지 않는다(브라우저 기본 동작에 맡긴다)', () => {
    render(<Row onOpen={vi.fn()} />);

    fireEvent.pointerDown(card(), mouse(300, { pointerType: 'touch' }));
    fireEvent.pointerMove(card(), mouse(200, { pointerType: 'touch' }));
    expect(row().scrollLeft).toBe(0);
    fireEvent.pointerUp(card(), mouse(200, { pointerType: 'touch' }));

    fireEvent.pointerDown(card(), mouse(300, { button: 2 }));
    fireEvent.pointerMove(card(), mouse(200, { button: 2 }));
    expect(row().scrollLeft).toBe(0);
  });

  it('링크·그림을 브라우저가 따로 끌어가지 않게 dragstart 를 막는다', () => {
    render(<Row onOpen={vi.fn()} />);
    expect(fireEvent.dragStart(card())).toBe(false);
  });
});
