import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, clearSession, NetworkError } from '../../shared/api';
import { resetFake } from '../../shared/api/fake/state';
import { COPY } from '../../shared/copy';
import { EnterPage } from './EnterPage';

function renderEnter() {
  const router = createMemoryRouter(
    [
      { path: '/enter', element: <EnterPage /> },
      { path: '/consent', element: <p>consent page</p> },
      { path: '/', element: <p>home page</p> },
    ],
    { initialEntries: ['/enter'] },
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

function codeInput(): HTMLInputElement {
  return screen.getByRole('textbox', { name: COPY['C-04'] });
}

function submitCode(value: string) {
  fireEvent.change(codeInput(), { target: { value } });
  fireEvent.submit(codeInput().closest('form') as HTMLFormElement);
}

beforeEach(() => {
  localStorage.clear();
  clearSession();
  resetFake();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EnterPage', () => {
  it('Enter 를 연달아 눌러도 요청은 한 번만 보낸다', async () => {
    const createSession = vi.spyOn(api, 'createSession');
    renderEnter();

    fireEvent.change(codeInput(), { target: { value: 'any-code' } });
    const form = codeInput().closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(await screen.findByText('consent page')).toBeTruthy();
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('코드가 틀리면 입력칸 아래에 오류 문장을 알리고 상단 띠는 띄우지 않는다', async () => {
    resetFake('?fakeError=ACCESS_CODE_INVALID');
    renderEnter();

    submitCode('wrong');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(COPY['C-05b']);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('코드가 틀리면 입력칸을 오류 상태로 표시하고 오류 문장과 연결한다', async () => {
    resetFake('?fakeError=ACCESS_CODE_INVALID');
    renderEnter();
    expect(codeInput().getAttribute('aria-invalid')).toBeNull();

    submitCode('wrong');

    const alert = await screen.findByRole('alert');
    const input = codeInput();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.contains(alert)).toBe(true);
  });

  it('연결이 끊기면 상단 띠로 알리고 입력칸 아래 오류는 띄우지 않는다', async () => {
    vi.spyOn(api, 'createSession').mockRejectedValue(new NetworkError());
    renderEnter();

    submitCode('any-code');

    const banner = await screen.findByRole('status');
    expect(banner.textContent).toContain(COPY['E-03']);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('다시 연결되면 연결 끊김 띠가 저절로 사라진다', async () => {
    vi.spyOn(api, 'createSession').mockRejectedValue(new NetworkError());
    renderEnter();

    submitCode('any-code');
    expect((await screen.findByRole('status')).textContent).toContain(COPY['E-03']);

    fireEvent(window, new Event('online'));

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('연결 끊김 띠에는 경고 아이콘이 있다', async () => {
    vi.spyOn(api, 'createSession').mockRejectedValue(new NetworkError());
    renderEnter();

    submitCode('any-code');

    const banner = await screen.findByRole('status');
    expect(banner.querySelector('[data-icon="warning"]')).not.toBeNull();
  });
});
