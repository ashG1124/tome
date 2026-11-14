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

  it('비활성이면 눌러도 바뀌지 않는다', () => {
    render(<Controlled disabled />);
    const sw = screen.getByRole('switch', { name: 'Post it?' });
    expect((sw as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });
});
