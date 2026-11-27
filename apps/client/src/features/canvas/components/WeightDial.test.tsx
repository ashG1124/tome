import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { WeightDial } from './WeightDial';

it('exposes the default, limits and instructions with an accessible name', () => {
  render(<WeightDial label="Weight" instructions="Use arrow keys" onChange={vi.fn()} />);
  const slider = screen.getByRole('slider', { name: 'Weight' }) as HTMLInputElement;
  expect(slider.value).toBe('5');
  expect(slider.min).toBe('0');
  expect(slider.max).toBe('9');
  expect(document.getElementById(slider.getAttribute('aria-describedby')!)?.textContent).toBe(
    'Use arrow keys',
  );
});

it('supports controlled keyboard changes and keeps handled keys out of the canvas', () => {
  const canvasKey = vi.fn();
  function Example() {
    const [value, setValue] = useState(5);
    return (
      <div onKeyDown={canvasKey}>
        <WeightDial value={value} label="Weight" onChange={setValue} />
      </div>
    );
  }
  render(<Example />);
  const slider = screen.getByRole('slider') as HTMLInputElement;
  for (const [key, value] of [
    ['ArrowLeft', '4'],
    ['ArrowDown', '3'],
    ['ArrowUp', '4'],
    ['ArrowRight', '5'],
    ['Home', '0'],
    ['ArrowLeft', '0'],
    ['End', '9'],
    ['ArrowUp', '9'],
  ]) {
    expect(fireEvent.keyDown(slider, { key })).toBe(false);
    expect(slider.value).toBe(value);
  }
  expect(canvasKey).not.toHaveBeenCalled();
  fireEvent.keyDown(slider, { key: 'Tab' });
  expect(canvasKey).toHaveBeenCalledOnce();
});

it('accepts native pointer changes and does not modify disabled values', () => {
  const change = vi.fn();
  const { rerender } = render(<WeightDial value={5} label="Weight" onChange={change} />);
  fireEvent.change(screen.getByRole('slider'), { target: { value: '7' } });
  expect(change).toHaveBeenCalledWith(7);
  change.mockClear();
  rerender(<WeightDial value={5} label="Weight" disabled onChange={change} />);
  const slider = screen.getByRole('slider') as HTMLInputElement;
  expect(slider.disabled).toBe(true);
  fireEvent.keyDown(slider, { key: 'End' });
  fireEvent.change(slider, { target: { value: '8' } });
  expect(change).not.toHaveBeenCalled();
});

/** jsdom 에는 크기가 없어서 숫자 띠(폭 500, 한 칸 100)와 가운데 칸(200~300)의 자리를 정해 준다. */
function layout() {
  class TestPointer extends MouseEvent {
    pointerId: number;
    constructor(type: string, options: PointerEventInit = {}) {
      super(type, options);
      this.pointerId = options.pointerId ?? 1;
    }
  }
  vi.stubGlobal('PointerEvent', TestPointer);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.classList.contains('node-edit-dial-current'))
      return { left: 200, top: 0, width: 100, height: 60 } as DOMRect;
    if (this.classList.contains('node-edit-dial'))
      return { left: 0, top: 0, width: 500, height: 60 } as DOMRect;
    return { left: 0, top: 0, width: 0, height: 0 } as DOMRect;
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Controlled({ onChange }: { onChange?: (value: number) => void }) {
  const [value, setValue] = useState(5);
  return (
    <WeightDial
      value={value}
      label="Weight"
      onChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
    />
  );
}

it('dragging left raises the weight and dragging right lowers it, one step per cell (#261)', () => {
  layout();
  const { container } = render(<Controlled />);
  const dial = container.querySelector('.node-edit-dial')!;
  const slider = screen.getByRole('slider') as HTMLInputElement;
  fireEvent.pointerDown(dial, { button: 0, pointerId: 1, clientX: 250 });
  expect(document.activeElement).toBe(slider);
  fireEvent.pointerMove(dial, { pointerId: 1, clientX: 150 });
  expect(slider.value).toBe('6');
  fireEvent.pointerMove(dial, { pointerId: 1, clientX: 40 });
  expect(slider.value).toBe('7');
  // 같은 끌기에서 오른쪽으로 되돌아가면 시작 값보다 작아진다.
  fireEvent.pointerMove(dial, { pointerId: 1, clientX: 460 });
  expect(slider.value).toBe('3');
  // 다른 손가락·마우스의 움직임은 따르지 않는다.
  fireEvent.pointerMove(dial, { pointerId: 2, clientX: 0 });
  expect(slider.value).toBe('3');
  fireEvent.pointerUp(dial, { pointerId: 1, clientX: 460 });
  expect(slider.value).toBe('3');
  // 뗀 뒤에는 움직여도 바뀌지 않는다.
  fireEvent.pointerMove(dial, { pointerId: 1, clientX: 0 });
  expect(slider.value).toBe('3');
});

it('keeps the weight inside 0–9 however far it is dragged', () => {
  layout();
  const { container } = render(<Controlled />);
  const dial = container.querySelector('.node-edit-dial')!;
  const slider = screen.getByRole('slider') as HTMLInputElement;
  fireEvent.pointerDown(dial, { button: 0, pointerId: 1, clientX: 250 });
  fireEvent.pointerMove(dial, { pointerId: 1, clientX: -2000 });
  expect(slider.value).toBe('9');
  fireEvent.pointerMove(dial, { pointerId: 1, clientX: 3000 });
  expect(slider.value).toBe('0');
  fireEvent.pointerCancel(dial, { pointerId: 1 });
});

it('a press without dragging picks the number in the pressed cell', () => {
  layout();
  const change = vi.fn();
  const { container } = render(<Controlled onChange={change} />);
  const dial = container.querySelector('.node-edit-dial')!;
  const slider = screen.getByRole('slider') as HTMLInputElement;
  // 가운데에서 오른쪽으로 두 칸(=7)
  fireEvent.pointerDown(dial, { button: 0, pointerId: 1, clientX: 450 });
  fireEvent.pointerMove(dial, { pointerId: 1, clientX: 452 });
  expect(change).not.toHaveBeenCalled();
  fireEvent.pointerUp(dial, { pointerId: 1, clientX: 452 });
  expect(slider.value).toBe('7');
  // 가운데 칸(지금 값)을 누르면 바뀌지 않는다.
  change.mockClear();
  fireEvent.pointerDown(dial, { button: 0, pointerId: 1, clientX: 250 });
  fireEvent.pointerUp(dial, { pointerId: 1, clientX: 250 });
  expect(change).not.toHaveBeenCalled();
  // 왼쪽 한 칸(=6)
  fireEvent.pointerDown(dial, { button: 0, pointerId: 1, clientX: 150 });
  fireEvent.pointerUp(dial, { pointerId: 1, clientX: 150 });
  expect(slider.value).toBe('6');
});

it('ignores the pointer while disabled and for other mouse buttons', () => {
  layout();
  const change = vi.fn();
  const { container, rerender } = render(
    <WeightDial value={5} label="Weight" disabled onChange={change} />,
  );
  const dial = container.querySelector('.node-edit-dial')!;
  fireEvent.pointerDown(dial, { button: 0, pointerId: 1, clientX: 250 });
  fireEvent.pointerMove(dial, { pointerId: 1, clientX: 50 });
  fireEvent.pointerUp(dial, { pointerId: 1, clientX: 50 });
  rerender(<WeightDial value={5} label="Weight" onChange={change} />);
  fireEvent.pointerDown(dial, { button: 2, pointerId: 1, clientX: 250 });
  fireEvent.pointerMove(dial, { pointerId: 1, clientX: 50 });
  fireEvent.pointerUp(dial, { pointerId: 1, clientX: 50 });
  expect(change).not.toHaveBeenCalled();
});
