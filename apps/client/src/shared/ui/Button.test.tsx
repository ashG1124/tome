import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('처리 중이면 바로 잠그고 aria-busy 를 켠다', () => {
    render(<Button busy>Enter</Button>);
    const button = screen.getByRole('button', { name: 'Enter' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('300ms 가 지나야 원형 표시를 띄운다(빨리 끝나면 깜빡이지 않게)', () => {
    vi.useFakeTimers();
    render(<Button busy>Enter</Button>);
    const button = screen.getByRole('button', { name: 'Enter' });
    expect(button.querySelector('[data-busy-mark]')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(button.querySelector('[data-busy-mark]')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    const mark = button.querySelector('[data-busy-mark]');
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
  });

  it('처리가 끝나면 원형 표시를 지우고 다시 누를 수 있다', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Button busy>Enter</Button>);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    rerender(<Button busy={false}>Enter</Button>);
    const button = screen.getByRole('button', { name: 'Enter' }) as HTMLButtonElement;
    expect(button.querySelector('[data-busy-mark]')).toBeNull();
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-busy')).toBeNull();
  });
});
