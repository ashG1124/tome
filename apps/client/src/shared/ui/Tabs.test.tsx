import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Tabs } from './Tabs';

const ITEMS = [
  { value: 'work', label: 'Work' },
  { value: 'identity', label: 'Identity' },
] as const;

function Controlled() {
  const [tab, setTab] = useState<'work' | 'identity'>('work');
  return (
    <Tabs value={tab} onValueChange={setTab} label="Profile" items={ITEMS}>
      <p>{`panel:${tab}`}</p>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('이름 있는 탭 목록과 고른 탭, 그 내용을 보여 준다', () => {
    render(<Controlled />);
    expect(screen.getByRole('tablist', { name: 'Profile' })).toBeTruthy();
    const work = screen.getByRole('tab', { name: 'Work' });
    expect(work.getAttribute('aria-selected')).toBe('true');
    const panel = screen.getByRole('tabpanel');
    expect(panel.textContent).toBe('panel:work');
    expect(panel.getAttribute('aria-labelledby')).toBe(work.id);
  });

  it('다른 탭을 누르면 그 탭이 열린다', () => {
    render(<Controlled />);
    const identity = screen.getByRole('tab', { name: 'Identity' });
    fireEvent.mouseDown(identity, { button: 0 });
    expect(identity.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toBe('panel:identity');
  });

  it('Tab 키로 탭 목록에 들어오면 고른 탭에 포커스가 간다', () => {
    render(<Controlled />);
    act(() => screen.getByRole('tablist').focus());
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Work' }));
    expect(screen.getByRole('tab', { name: 'Identity' }).tabIndex).toBe(-1);
  });
});
