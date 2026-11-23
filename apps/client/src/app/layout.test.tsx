import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiConfig,
  clearSession,
  resetFirstRequestWatch,
  setSession,
  SLOW_FIRST_REQUEST_MS,
} from '../shared/api';
import { FAKE_NOTICE_VERSION, FAKE_TOKEN } from '../shared/api/fake/data';
import { resetFake, setFakeConsented } from '../shared/api/fake/state';
import { COPY } from '../shared/copy';
import { routes } from './router';

const originalDelay = apiConfig.fakeDelayMs;
const realSetTimeout = globalThis.setTimeout;

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  clearSession();
  resetFake();
  resetFirstRequestWatch();
});

afterEach(() => {
  vi.useRealTimers();
  apiConfig.fakeDelayMs = originalDelay;
});

describe('서버 깨우는 중 띠(S-05)', () => {
  it('새로고침한 홈의 첫 요청이 1초를 넘기면 맨 위에 아이콘 없이 뜨고, 끝나면 사라진다', async () => {
    // 실제 시간 대신 가짜 타이머로 1초 경계를 시험한다(전체 테스트가 몰려 느려져도 흔들리지 않게)
    vi.useFakeTimers();
    // 동의까지 마친 사람이 홈을 새로고침한 상태
    setSession(FAKE_TOKEN, FAKE_NOTICE_VERSION);
    setFakeConsented();
    apiConfig.fakeDelayMs = 1500;

    // 띠의 1초 타이머가 걸린 순간부터 센다(화면이 첫 요청을 보내는 때는 부하에 따라 달라서, 실제 시간으로 걸렸는지만 기다린다)
    const timerCalls = vi.spyOn(globalThis, 'setTimeout');
    renderAt('/');
    for (let tries = 0; tries < 400; tries += 1) {
      if (timerCalls.mock.calls.some(([, delay]) => delay === SLOW_FIRST_REQUEST_MS)) break;
      await act(() => new Promise<void>((resolve) => realSetTimeout(resolve, 25)));
    }
    expect(timerCalls.mock.calls.some(([, delay]) => delay === SLOW_FIRST_REQUEST_MS)).toBe(true);

    // 1초 전에는 띠가 없다(홈에는 플래시용 status 칸도 있어서 띠는 문구로 찾는다)
    await act(() => vi.advanceTimersByTimeAsync(SLOW_FIRST_REQUEST_MS - 1));
    expect(screen.queryByText(COPY['S-05'])).toBeNull();

    // 1초가 되면 맨 위에 아이콘 없이 뜬다
    await act(() => vi.advanceTimersByTimeAsync(1));
    const banner = screen.getByText(COPY['S-05']).closest('[role="status"]');
    expect(banner).not.toBeNull();
    expect(banner?.querySelector('[data-icon]')).toBeNull();

    // 응답이 오면 사라지고 화면이 그려진다
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.queryByText(COPY['S-05'])).toBeNull();
    expect(screen.getByRole('link', { name: 'Neon street at night' })).toBeTruthy();
  });

  it('첫 요청이 빠르면 띠가 뜨지 않는다', async () => {
    setSession(FAKE_TOKEN, FAKE_NOTICE_VERSION);
    setFakeConsented();

    renderAt('/');

    expect(await screen.findByRole('link', { name: 'Neon street at night' })).toBeTruthy();
    expect(screen.queryByText(COPY['S-05'])).toBeNull();
  });
});
