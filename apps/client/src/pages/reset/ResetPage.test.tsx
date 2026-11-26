import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, clearSession, setSession, useSessionStore } from '../../shared/api';
import { FAKE_NOTICE_VERSION, FAKE_TOKEN } from '../../shared/api/fake/data';
import { resetFake, setFakeConsented } from '../../shared/api/fake/state';
import { COPY } from '../../shared/copy';
import { ResetFlash } from './ResetFlash';
import { ResetPage } from './ResetPage';
import { hideResetNotice } from './resetNotice';

function renderReset() {
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <Outlet />
            <ResetFlash />
          </>
        ),
        children: [
          { path: '/reset', element: <ResetPage /> },
          { path: '/', element: <p>start screen</p> },
        ],
      },
    ],
    { initialEntries: ['/reset'] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['me'], { creator: { id: 'someone' } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client };
}

function openConfirm() {
  fireEvent.click(screen.getByRole('button', { name: COPY['RS-02'] }));
  return screen.getByRole('dialog', { name: COPY['RS-04'] });
}

beforeEach(() => {
  localStorage.clear();
  clearSession();
  resetFake();
  hideResetNotice();
  setSession(FAKE_TOKEN, FAKE_NOTICE_VERSION);
  setFakeConsented();
  localStorage.setItem('tome.home.layout.creator-1', '{"v":1}');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ResetPage', () => {
  it('운영자용 안내와 큰 초기화 버튼을 보여 준다', () => {
    renderReset();
    expect(screen.getByRole('heading', { level: 1, name: COPY['RS-02'] })).toBeTruthy();
    expect(screen.getByText(COPY['RS-03'])).toBeTruthy();
    expect(screen.getByRole('link', { name: COPY['RS-07'] }).getAttribute('href')).toBe('/');
  });

  it('확인 창을 열면 포커스가 Cancel 에 있고, Cancel 은 아무것도 지우지 않는다', async () => {
    const endSession = vi.spyOn(api, 'endSession');
    renderReset();
    openConfirm();

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: COPY['D-09a'] })),
    );
    fireEvent.click(screen.getByRole('button', { name: COPY['D-09a'] }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(endSession).not.toHaveBeenCalled();
    expect(useSessionStore.getState().token).toBe(FAKE_TOKEN);
    expect(localStorage.getItem('tome.home.layout.creator-1')).not.toBeNull();
  });

  it('Esc 로 확인 창을 닫으면 아무것도 지우지 않는다', async () => {
    renderReset();
    const dialog = openConfirm();
    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(useSessionStore.getState().token).toBe(FAKE_TOKEN);
    expect(localStorage.getItem('tome.home.layout.creator-1')).not.toBeNull();
  });

  it('Reset 을 누르면 세션을 끝내고 값을 지운 뒤 처음 화면에서 "Session reset." 을 알린다', async () => {
    const endSession = vi.spyOn(api, 'endSession');
    const { router, client } = renderReset();
    openConfirm();
    fireEvent.click(screen.getByRole('button', { name: COPY['RS-06'] }));

    expect(await screen.findByText('start screen')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().token).toBeNull();
    expect(Object.keys(localStorage).filter((key) => key.startsWith('tome.'))).toEqual([]);
    expect(client.getQueryData(['me'])).toBeUndefined();
    expect(screen.getByRole('status').textContent).toBe(COPY['RS-08']);
  });
});
