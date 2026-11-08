import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession } from '../shared/api';
import { resetFake } from '../shared/api/fake/state';
import { COPY } from '../shared/copy';
import { routes } from './router';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
});

describe('라우트', () => {
  it.each(['/', '/consent', '/projects/abc'])(
    '세션이 없으면 %s 에서 /enter 로 간다',
    async (path) => {
      const router = renderAt(path);
      expect(await screen.findByRole('heading', { name: COPY['C-04'] })).toBeTruthy();
      expect(router.state.location.pathname).toBe('/enter');
    },
  );

  it('코드 입력 → 동의 → 서가 → 워크스페이스로 이어진다', async () => {
    const router = renderAt('/enter');

    fireEvent.change(await screen.findByRole('textbox', { name: COPY['C-04'] }), {
      target: { value: 'any-code' },
    });
    fireEvent.click(screen.getByRole('button', { name: COPY['C-05a'] }));

    const agree = await screen.findByRole('button', { name: COPY['C-03'] });
    expect(router.state.location.pathname).toBe('/consent');
    expect(screen.getByRole('dialog', { name: COPY['C-01'] })).toBeTruthy();
    fireEvent.click(agree);

    const project = await screen.findByRole('link', { name: 'Neon street at night' });
    expect(router.state.location.pathname).toBe('/');
    fireEvent.click(project);

    expect(await screen.findByText('Pages: 1')).toBeTruthy();
    expect(router.state.location.pathname).toMatch(/^\/projects\/.+/);
  });

  it('서가가 비어 있으면 S-01 문구를 보여 준다', async () => {
    resetFake('?fakeProjects=empty');
    renderAt('/enter');
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'any-code' } });
    fireEvent.click(screen.getByRole('button', { name: COPY['C-05a'] }));
    fireEvent.click(await screen.findByRole('button', { name: COPY['C-03'] }));
    expect(await screen.findByText(COPY['S-01'])).toBeTruthy();
  });

  it('코드가 틀리면 입력칸 아래에 오류를 알린다', async () => {
    resetFake('?fakeError=ACCESS_CODE_INVALID');
    renderAt('/enter');
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: COPY['C-05a'] }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(COPY['C-05b']);
  });
});
