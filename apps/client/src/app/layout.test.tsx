import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiConfig, clearSession, resetFirstRequestWatch, setSession } from '../shared/api';
import { FAKE_NOTICE_VERSION, FAKE_TOKEN } from '../shared/api/fake/data';
import { resetFake, setFakeConsented } from '../shared/api/fake/state';
import { COPY } from '../shared/copy';
import { routes } from './router';

const originalDelay = apiConfig.fakeDelayMs;

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
  apiConfig.fakeDelayMs = originalDelay;
});

describe('서버 깨우는 중 띠(S-05)', () => {
  it('새로고침한 홈의 첫 요청이 1초를 넘기면 맨 위에 아이콘 없이 뜨고, 끝나면 사라진다', async () => {
    // 동의까지 마친 사람이 홈을 새로고침한 상태
    setSession(FAKE_TOKEN, FAKE_NOTICE_VERSION);
    setFakeConsented();
    apiConfig.fakeDelayMs = 1500;

    renderAt('/');

    const banner = await screen.findByRole('status', {}, { timeout: 1400 });
    expect(banner.textContent).toContain(COPY['S-05']);
    expect(banner.querySelector('[data-icon]')).toBeNull();

    expect(await screen.findByRole('link', { name: 'Neon street at night' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('첫 요청이 빠르면 띠가 뜨지 않는다', async () => {
    setSession(FAKE_TOKEN, FAKE_NOTICE_VERSION);
    setFakeConsented();

    renderAt('/');

    expect(await screen.findByRole('link', { name: 'Neon street at night' })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
