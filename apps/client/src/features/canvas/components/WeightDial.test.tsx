import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
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
