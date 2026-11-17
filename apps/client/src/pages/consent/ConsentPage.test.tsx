import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, clearSession, NetworkError, setSession } from '../../shared/api';
import { FAKE_NOTICE_VERSION, FAKE_TOKEN } from '../../shared/api/fake/data';
import { resetFake } from '../../shared/api/fake/state';
import { COPY } from '../../shared/copy';
import { ConsentPage } from './ConsentPage';

function renderConsent() {
  const router = createMemoryRouter(
    [
      { path: '/consent', element: <ConsentPage /> },
      { path: '/', element: <p>home page</p> },
      { path: '/enter', element: <p>enter page</p> },
    ],
    { initialEntries: ['/consent'] },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  localStorage.clear();
  clearSession();
  resetFake();
  setSession(FAKE_TOKEN, FAKE_NOTICE_VERSION);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConsentPage', () => {
  it('동의 버튼을 연달아 눌러도 요청은 한 번만 보낸다', async () => {
    const consent = vi.spyOn(api, 'consent');
    renderConsent();

    const agree = await screen.findByRole('button', { name: COPY['C-03'] });
    fireEvent.click(agree);
    fireEvent.click(agree);
    fireEvent.click(agree);

    expect(await screen.findByText('home page')).toBeTruthy();
    expect(consent).toHaveBeenCalledTimes(1);
  });

  it('동의 요청이 실패하면 오류를 알리고 다시 누를 수 있다', async () => {
    const consent = vi.spyOn(api, 'consent').mockRejectedValueOnce(new NetworkError());
    renderConsent();

    fireEvent.click(await screen.findByRole('button', { name: COPY['C-03'] }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(COPY['E-03']);

    fireEvent.click(screen.getByRole('button', { name: COPY['C-03'] }));

    expect(await screen.findByText('home page')).toBeTruthy();
    expect(consent).toHaveBeenCalledTimes(2);
  });
});
