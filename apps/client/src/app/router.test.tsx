import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../shared/api';
import { FAKE_NOTICE_VERSION, FAKE_TOKEN } from '../shared/api/fake/data';
import { resetFake, setFakeConsented } from '../shared/api/fake/state';
import { COPY } from '../shared/copy';
import { routes } from './router';

/** 랜딩은 그림·카드가 많아 접근성 질의가 느려서, 병렬 테스트 부하에도 견디게 넉넉히 기다린다 */
const SLOW_RENDER = { timeout: 8000 };

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

/**
 * 페이지는 길을 열 때 내려받는다. 테스트에서는 그 첫 변환(transform)이 느려서 리다이렉트 확인이 기본 대기 시간을 넘길 수 있으므로,
 * 라우트가 쓰는 같은 모듈을 미리 불러 둔다(단언·대기 시간은 그대로).
 */
beforeAll(async () => {
  await Promise.all([
    import('../pages/agora'),
    import('../pages/consent'),
    import('../pages/enter'),
    import('../pages/landing'),
    import('../pages/profile'),
    import('../pages/workspace'),
  ]);
}, 60_000);

beforeEach(() => {
  localStorage.clear();
  clearSession();
  resetFake();
});

describe('라우트', () => {
  it.each([
    '/consent',
    '/projects/abc',
    '/creators/abc',
    '/agora',
    '/agora/topics/abc',
    '/agora/projects/abc',
  ])('세션이 없으면 %s 에서 /enter 로 간다', async (path) => {
    const router = renderAt(path);
    expect(await screen.findByRole('heading', { name: COPY['C-04'] })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/enter');
  });

  it('세션이 없으면 / 는 랜딩을 보여 주고 경로가 / 로 남는다', async () => {
    const router = renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: COPY['W-06'] }, SLOW_RENDER),
    ).toBeTruthy();
    expect(screen.getAllByText(COPY['ON-04'], { selector: 'p' })).toHaveLength(2);
    expect(router.state.location.pathname).toBe('/');
  });

  it('랜딩의 Get Started 를 누르면 전시 코드 화면으로 간다', async () => {
    const router = renderAt('/');
    fireEvent.click(await screen.findByRole('link', { name: COPY['ON-03'] }, SLOW_RENDER));
    expect(await screen.findByRole('heading', { name: COPY['C-04'] })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/enter');
  });

  it('세션이 있으면 / 는 홈 서가를 보여 준다', async () => {
    setSession(FAKE_TOKEN, FAKE_NOTICE_VERSION);
    setFakeConsented();
    const router = renderAt('/');
    expect(await screen.findByRole('link', { name: 'Neon street at night' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1, name: COPY['W-06'] })).toBeNull();
    expect(router.state.location.pathname).toBe('/');
  });

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

    expect(await screen.findByRole('button', { name: `${COPY['W-02']} 1` })).toBeTruthy();
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
