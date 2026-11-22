import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { Pad } from '@tome/shared';
import { MeaningPad } from './MeaningPad';

const pad: Pad = { x: 0, y: 0, xAxis: ['Textured', 'Smooth'], yAxis: ['Horizon', 'Surrounding'] };
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('announces both unsigned axis coordinates and external instructions', () => {
  render(
    <MeaningPad
      value={{ ...pad, x: -2, y: 3 }}
      label="Meaning"
      instructions="Use arrow keys"
      onChange={vi.fn()}
    />,
  );
  const slider = screen.getByRole('slider', { name: 'Meaning' });
  expect(slider.getAttribute('aria-valuetext')).toBe('Textured 2, Surrounding 3');
  expect(slider.getAttribute('aria-valuenow')).toBe('-2');
  expect(slider.getAttribute('aria-valuemin')).toBe('-5');
  expect(slider.getAttribute('aria-valuemax')).toBe('5');
  expect(document.getElementById(slider.getAttribute('aria-describedby')!)?.textContent).toBe(
    'Use arrow keys',
  );
});

it('moves both axes, clamps and returns to neutral while isolating canvas shortcuts', () => {
  const canvasKey = vi.fn();
  function Example() {
    const [value, setValue] = useState<Pad>({ ...pad, x: -5, y: 5 });
    return (
      <div onKeyDown={canvasKey}>
        <MeaningPad value={value} label="Meaning" onChange={setValue} />
      </div>
    );
  }
  render(<Example />);
  const slider = screen.getByRole('slider');
  for (const [key, text] of [
    ['ArrowLeft', 'Textured 5, Surrounding 5'],
    ['ArrowUp', 'Textured 5, Surrounding 5'],
    ['ArrowRight', 'Textured 4, Surrounding 5'],
    ['ArrowDown', 'Textured 4, Surrounding 4'],
    ['Home', 'Smooth 0, Surrounding 0'],
  ]) {
    expect(fireEvent.keyDown(slider, { key })).toBe(false);
    expect(slider.getAttribute('aria-valuetext')).toBe(text);
  }
  expect(canvasKey).not.toHaveBeenCalled();
  fireEvent.keyDown(slider, { key: 'Tab' });
  expect(canvasKey).toHaveBeenCalledOnce();
});

it('maps pointer dragging to integer coordinates and stops after cancellation', () => {
  class TestPointer extends MouseEvent {
    pointerId: number;
    constructor(type: string, options: PointerEventInit = {}) {
      super(type, options);
      this.pointerId = options.pointerId ?? 1;
    }
  }
  vi.stubGlobal('PointerEvent', TestPointer);
  const change = vi.fn();
  render(<MeaningPad value={pad} label="Meaning" onChange={change} />);
  const slider = screen.getByRole('slider');
  vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
    left: 10,
    top: 20,
    width: 100,
    height: 100,
  } as DOMRect);
  fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 10, clientY: 20 });
  expect(change).toHaveBeenLastCalledWith({ ...pad, x: -5, y: 5 });
  expect(document.activeElement).toBe(slider);
  fireEvent.pointerMove(slider, { pointerId: 1, clientX: 110, clientY: 120 });
  expect(change).toHaveBeenLastCalledWith({ ...pad, x: 5, y: -5 });
  fireEvent.pointerMove(slider, { pointerId: 2, clientX: 60, clientY: 70 });
  expect(change).toHaveBeenCalledTimes(2);
  fireEvent.pointerCancel(slider, { pointerId: 1 });
  fireEvent.pointerMove(slider, { pointerId: 1, clientX: 10, clientY: 120 });
  expect(change).toHaveBeenCalledTimes(2);
});

it('does not change a disabled pad', () => {
  const change = vi.fn();
  render(<MeaningPad value={pad} label="Meaning" disabled onChange={change} />);
  const slider = screen.getByRole('slider');
  expect(slider.tabIndex).toBe(-1);
  expect(slider.getAttribute('aria-disabled')).toBe('true');
  fireEvent.keyDown(slider, { key: 'ArrowRight' });
  fireEvent.pointerDown(slider, { button: 0, clientX: 10, clientY: 10 });
  expect(change).not.toHaveBeenCalled();
});
