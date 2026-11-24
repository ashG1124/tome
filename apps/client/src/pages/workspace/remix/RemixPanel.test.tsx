import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiRequestError, clearSession, setSession } from '../../../shared/api';
import { FAKE_NOTICE_VERSION, FAKE_TOKEN } from '../../../shared/api/fake/data';
import { FAKE_OTHER_CREATORS } from '../../../shared/api/fake/identity';
import { fakeState, resetFake } from '../../../shared/api/fake/state';
import { COPY } from '../../../shared/copy';
import { RemixPanel } from './RemixPanel';

// 가짜 응답 모드에서 후보 목록·즐겨찾기·상대 고르기를 본다.

const [LIND, MARA] = FAKE_OTHER_CREATORS;
if (LIND === undefined || MARA === undefined) throw new Error('가짜 창작자가 없다');

function setup({
  partner,
  choosing = false,
  chooseError = null,
}: {
  partner?: typeof LIND;
  choosing?: boolean;
  chooseError?: unknown;
} = {}) {
  const onChoose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RemixPanel
        id="remix-panel"
        partner={partner}
        choosing={choosing}
        chooseError={chooseError}
        onChoose={onChoose}
      />
    </QueryClientProvider>,
  );
  return { onChoose };
}

const row = (name: string) => screen.findByRole('button', { name: new RegExp(`^${name}`) });

beforeEach(() => {
  localStorage.clear();
  resetFake();
  fakeState.consented = true;
  setSession(FAKE_TOKEN, FAKE_NOTICE_VERSION);
});

afterEach(() => {
  clearSession();
  vi.restoreAllMocks();
});

describe('RemixPanel', () => {
  it('"Remix with" 묶음 안에 Rising·Favorite 탭과 후보(이름·한 줄 소개)를 보여 준다. 검색칸이 있다', async () => {
    setup();
    const group = screen.getByRole('group', { name: COPY['RX-01'] });
    const tabs = within(group).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([COPY['RX-02'], COPY['RX-03']]);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect((await row('Lind')).textContent).toContain('Quiet shapes, loud colors.');
    expect(await row('Mara')).toBeTruthy();
    // 검색칸은 목록의 이름·소개를 이 화면 안에서만 거른다
    const search = screen.getByRole('searchbox', { name: COPY['FG-02'] });
    fireEvent.change(search, { target: { value: 'mara' } });
    expect(screen.queryByRole('button', { name: /^Lind/ })).toBeNull();
    expect(await row('Mara')).toBeTruthy();
  });

  it('후보를 누르면 그 사람 id 로 onChoose 를 부른다', async () => {
    const { onChoose } = setup();
    fireEvent.click(await row('Mara'));
    expect(onChoose).toHaveBeenCalledWith(MARA.id);
  });

  it('지금 상대는 aria-current 와 체크 아이콘으로 표시한다', async () => {
    setup({ partner: LIND });
    const lind = await row('Lind');
    expect(lind.getAttribute('aria-current')).toBe('true');
    expect(lind.querySelector('[data-icon="done"]')).not.toBeNull();
    expect((await row('Mara')).getAttribute('aria-current')).toBeNull();
    // 위 알약에도 상대 이름이 붙는다
    expect(screen.getByText(`${COPY['RX-01']} Lind`)).toBeTruthy();
  });

  it('목록은 시안 폭(268) 칸에 그리고, 기본 스크롤 막대 대신 4px 막대 자리를 둔다', async () => {
    setup();
    await row('Lind');
    const list = screen.getByRole('group', { name: COPY['RX-01'] }).querySelector('ul');
    expect(list?.className).toContain('w-[var(--size-remix-list-width)]');
    expect(list?.className).toContain('[scrollbar-width:none]');
    // jsdom 은 높이가 0 이라 넘치지 않으므로 막대는 숨어 있다
    expect(document.querySelector<HTMLElement>('[data-remix-scroll-thumb]')?.hidden).toBe(true);
  });

  it('사진이 없으면 목록·알약 동그라미에 이름 머리글자를 쓴다', async () => {
    setup({ partner: LIND });
    const lind = await row('Lind');
    expect(lind.querySelector('[aria-hidden="true"]')?.textContent).toBe('L');
    const pill = screen.getByText(`${COPY['RX-01']} Lind`).parentElement?.parentElement;
    expect(pill?.lastElementChild?.textContent).toBe('L');
  });

  it('저장 중이면 후보를 누를 수 없다', async () => {
    setup({ choosing: true });
    expect(((await row('Lind')) as HTMLButtonElement).disabled).toBe(true);
  });

  it('별을 누르면 즐겨찾기에 넣고, Favorite 탭에 그 사람이 보인다', async () => {
    const add = vi.spyOn(api, 'addFavorite');
    setup();
    const star = await screen.findByRole('button', { name: `${COPY['RX-07']}: Mara` });
    expect(star.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(star);
    await waitFor(() => expect(add).toHaveBeenCalledWith(MARA.id));
    const pressed = await screen.findByRole('button', { name: `${COPY['RX-08']}: Mara` });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');

    const favoriteTab = screen.getByRole('tab', { name: COPY['RX-03'] });
    fireEvent.mouseDown(favoriteTab);
    fireEvent.click(favoriteTab);
    expect(await row('Mara')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Lind/ })).toBeNull();
  });

  it('즐겨찾기를 끄면 해제 API 를 부른다', async () => {
    await api.addFavorite(LIND.id);
    const remove = vi.spyOn(api, 'removeFavorite');
    setup();
    fireEvent.click(await screen.findByRole('button', { name: `${COPY['RX-08']}: Lind` }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(LIND.id));
    expect(await screen.findByRole('button', { name: `${COPY['RX-07']}: Lind` })).toBeTruthy();
  });

  it('Favorite 탭이 비어 있으면 S-04 를 보여 준다', async () => {
    setup();
    const favoriteTab = screen.getByRole('tab', { name: COPY['RX-03'] });
    fireEvent.mouseDown(favoriteTab);
    fireEvent.click(favoriteTab);
    expect((await screen.findByRole('status')).textContent).toBe(COPY['S-04']);
  });

  it('후보 목록을 못 받아도 오류 대신 S-04 를 보이고, 새로고침으로 다시 받는다', async () => {
    const get = vi
      .spyOn(api, 'getRemixCandidates')
      .mockRejectedValueOnce(
        new ApiRequestError(500, { code: 'INTERNAL', message: 'x', retryable: true }),
      );
    setup();
    expect((await screen.findByRole('status')).textContent).toBe(COPY['S-04']);
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: COPY['RX-06'] }));
    expect(await row('Lind')).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('상대 저장이 실패하면 패널 안에 오류 문구를 보여 준다', async () => {
    setup({
      chooseError: new ApiRequestError(403, {
        code: 'IDENTITY_PRIVATE',
        message: 'private',
        retryable: false,
      }),
    });
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
