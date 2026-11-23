import { LIMITS, type WorkspaceResponse } from '@tome/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { COPY } from '../../shared/copy';
import { IconMenu, type FinishSlot } from './IconMenu';
import { pageMenu } from './pageMenu';

const IDS = Array.from(
  { length: LIMITS.PAGES_MAX },
  (_, i) => `c4a1e7d2-8b5f-4e39-a6c0-2f1d3b4a5c${String(i).padStart(2, '0')}`,
);

function menuOf(count: number, current = 0) {
  const pages: WorkspaceResponse['pages'] = IDS.slice(0, count).map((id, index) => ({
    id,
    index,
    setCount: 0,
  }));
  return pageMenu({ pages, currentPageId: IDS[current] ?? '' });
}

function setup(count = 2, finish?: FinishSlot) {
  const onSelectPage = vi.fn();
  const onAddPage = vi.fn();
  render(
    <IconMenu
      menu={menuOf(count)}
      onSelectPage={onSelectPage}
      onAddPage={onAddPage}
      finish={finish}
    />,
  );
  const index = screen.getByRole('button', { name: `${COPY['W-02']} ${count}` });
  return { onSelectPage, onAddPage, index };
}

describe('IconMenu', () => {
  it('인덱스 버튼에 페이지 수가 보이고, 누르면 "Page N" 목록과 + 가 열린다', () => {
    const { index } = setup(2);

    expect(index.getAttribute('aria-expanded')).toBe('false');
    expect(index.textContent).toContain('2');
    expect(screen.queryByRole('button', { name: COPY['W-03'] })).toBeNull();

    fireEvent.click(index);

    expect(index.getAttribute('aria-expanded')).toBe('true');
    const pages = screen.getAllByRole('button', { name: new RegExp(`^${COPY['W-01']} \\d+$`) });
    expect(pages.map((b) => b.textContent)).toEqual([`${COPY['W-01']} 1`, `${COPY['W-01']} 2`]);
    expect(pages[0]?.getAttribute('aria-current')).toBe('page');
    expect(pages[1]?.getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: COPY['W-03'] })).toBeTruthy();
  });

  it('다른 페이지를 고르면 알리고, 목록을 닫고 포커스를 인덱스 버튼으로 돌려준다', () => {
    const { index, onSelectPage } = setup(2);

    fireEvent.click(index);
    fireEvent.click(screen.getByRole('button', { name: `${COPY['W-01']} 2` }));

    expect(onSelectPage).toHaveBeenCalledWith(IDS[1]);
    expect(index.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(index);
  });

  it('지금 페이지를 다시 고르면 닫기만 한다', () => {
    const { index, onSelectPage } = setup(2);

    fireEvent.click(index);
    fireEvent.click(screen.getByRole('button', { name: `${COPY['W-01']} 1` }));

    expect(onSelectPage).not.toHaveBeenCalled();
    expect(index.getAttribute('aria-expanded')).toBe('false');
  });

  it('+ 를 누르면 페이지 추가를 알리고, 10개면 + 가 꺼진다', () => {
    const { index, onAddPage } = setup(3);
    fireEvent.click(index);
    fireEvent.click(screen.getByRole('button', { name: COPY['W-03'] }));
    expect(onAddPage).toHaveBeenCalledTimes(1);

    const full = setup(LIMITS.PAGES_MAX);
    fireEvent.click(full.index);
    const add = screen.getAllByRole('button', { name: COPY['W-03'] }).at(-1) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
  });

  it('Esc 나 바깥 클릭으로 닫힌다', () => {
    const { index } = setup(2);

    fireEvent.click(index);
    fireEvent.keyDown(index, { key: 'Escape' });
    expect(index.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(index);

    fireEvent.click(index);
    fireEvent.pointerDown(document.body);
    expect(index.getAttribute('aria-expanded')).toBe('false');
  });

  it('끝내기 칸: 켜져 있으면 누를 수 있고, 꺼져 있으면 이유를 옆에 한 줄로 보인다', () => {
    const onOpen = vi.fn();
    setup(1, { enabled: true, reason: null, onOpen });
    fireEvent.click(screen.getByRole('button', { name: COPY['W-04'] }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('끝내기가 꺼져 있으면 버튼을 막고 G1 을 연결한다', () => {
    setup(1, { enabled: false, reason: 'G1', onOpen: vi.fn() });

    const save = screen.getByRole('button', { name: COPY['W-04'] }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    const reasonId = save.getAttribute('aria-describedby');
    const reason = document.getElementById(reasonId ?? '');
    expect(reason?.textContent).toBe(COPY.G1);
    // 말풍선은 평소엔 투명하고 hover·focus 때만 보인다
    expect(reason?.className).toContain('opacity-0');
    expect(reason?.className).toContain('group-hover:opacity-100');
    expect(reason?.className).toContain('group-focus-within:opacity-100');
  });

  it('끝내기 칸을 주지 않으면 그리지 않는다', () => {
    setup(1);
    expect(screen.queryByRole('button', { name: COPY['W-04'] })).toBeNull();
  });
});

describe('IconMenu 리믹스 칸(#41)', () => {
  function Harness({ partnerName }: { partnerName?: string }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button">outside</button>
        <IconMenu
          menu={menuOf(1)}
          onSelectPage={vi.fn()}
          onAddPage={vi.fn()}
          remix={{
            open,
            partnerName,
            panelId: 'remix-panel',
            onOpen: () => setOpen(true),
            onClose: () => setOpen(false),
            panel: (
              <div id="remix-panel">
                <button type="button" onClick={() => setOpen(false)}>
                  pick
                </button>
              </div>
            ),
          }}
        />
      </>
    );
  }

  const remixButton = () => screen.getByRole('button', { name: COPY['RX-05'] });

  it('리믹스 버튼을 누르면 패널이 열리고(aria-expanded), 다시 누르면 닫힌다', () => {
    render(<Harness />);
    expect(remixButton().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(remixButton());
    expect(remixButton().getAttribute('aria-expanded')).toBe('true');
    expect(remixButton().getAttribute('aria-controls')).toBe('remix-panel');
    expect(screen.getByRole('button', { name: 'pick' })).toBeTruthy();
    fireEvent.click(remixButton());
    expect(screen.queryByRole('button', { name: 'pick' })).toBeNull();
  });

  it('Esc 로 닫히면 포커스가 리믹스 버튼으로 돌아온다', () => {
    render(<Harness />);
    fireEvent.click(remixButton());
    const pick = screen.getByRole('button', { name: 'pick' });
    pick.focus();
    fireEvent.keyDown(pick, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'pick' })).toBeNull();
    expect(document.activeElement).toBe(remixButton());
  });

  it('패널 안에서 골라 닫혀도 포커스가 리믹스 버튼으로 돌아온다', () => {
    render(<Harness />);
    fireEvent.click(remixButton());
    const pick = screen.getByRole('button', { name: 'pick' });
    pick.focus();
    fireEvent.click(pick);
    expect(document.activeElement).toBe(remixButton());
  });

  it('바깥을 누르면 닫히고, 포커스는 누른 곳에 둔다', () => {
    render(<Harness />);
    fireEvent.click(remixButton());
    const outside = screen.getByRole('button', { name: 'outside' });
    outside.focus();
    fireEvent.pointerDown(outside);
    expect(screen.queryByRole('button', { name: 'pick' })).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it('상대가 있고 닫혀 있으면 "Remix with 이름" 알약을 보이고, 누르면 다시 연다', () => {
    render(<Harness partnerName="Lind" />);
    const pill = screen.getByRole('button', { name: new RegExp(`${COPY['RX-01']} Lind`) });
    fireEvent.click(pill);
    expect(remixButton().getAttribute('aria-expanded')).toBe('true');
  });

  it('상대가 없으면 닫혀 있을 때 알약이 없다', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: new RegExp(COPY['RX-01']) })).toBeNull();
  });
});
