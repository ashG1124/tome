import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Switch } from './Switch';

function Controlled({ disabled }: { disabled?: boolean }) {
  const [on, setOn] = useState(false);
  return (
    <>
      <p id="q">Post it?</p>
      <Switch checked={on} onCheckedChange={setOn} aria-labelledby="q" disabled={disabled} />
    </>
  );
}

describe('Switch', () => {
  it('글로 이름을 받은 스위치이고 처음엔 꺼져 있다', () => {
    render(<Controlled />);
    const sw = screen.getByRole('switch', { name: 'Post it?' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  it('누르면 켜지고 다시 누르면 꺼진다', () => {
    render(<Controlled />);
    const sw = screen.getByRole('switch', { name: 'Post it?' });
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  it('시안처럼 바깥선 없이 면 색과 흰 손잡이만 있다(3182:176310)', () => {
    render(<Controlled />);
    const sw = screen.getByRole('switch', { name: 'Post it?' });
    expect(sw.className).toContain('border-0');
    expect(sw.className).not.toContain('border-[color:var(--color-border-input)]');
    expect(sw.className).toContain('focus-visible:outline-[color:var(--color-border-input)]!');
    expect(sw.className).toContain('data-[state=checked]:bg-[color:var(--color-tome-yellow-7)]');
    const thumb = sw.firstElementChild as HTMLElement;
    expect(thumb.className).toContain('size-[var(--size-switch-thumb)]');
    expect(thumb.className).not.toContain('shadow');
  });

  it('비활성이면 눌러도 바뀌지 않는다', () => {
    render(<Controlled disabled />);
    const sw = screen.getByRole('switch', { name: 'Post it?' });
    expect((sw as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });
});
