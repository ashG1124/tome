import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiRequestError, clearSession, setSession } from '../../shared/api';
import { FAKE_CREATOR } from '../../shared/api/fake/data';
import { FAKE_OTHER_CREATORS } from '../../shared/api/fake/identity';
import { resetFake } from '../../shared/api/fake/state';
import { COPY } from '../../shared/copy';
import { ProfilePage } from './ProfilePage';

const OTHER = FAKE_OTHER_CREATORS[0];

/** 주소 옵션(?fakeIdentity=…)을 준 가짜 서버에 들어와 동의까지 마친다. */
async function signIn(search = '') {
  resetFake(search);
  const session = await api.createSession('any-code');
  setSession(session.token, session.noticeVersion);
  await api.consent(session.noticeVersion);
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/creators/:id', element: <ProfilePage /> },
      { path: '/enter', element: <p>enter</p> },
      { path: '/projects/:id', element: <p>workspace</p> },
    ],
    { initialEntries: [path] },
  );
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('프로필 화면 /creators/:id', () => {
  it('내 프로필을 받아 이름과 탭을 그린다', async () => {
    await signIn();
    renderAt(`/creators/${FAKE_CREATOR.id}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: FAKE_CREATOR.displayName }),
    ).toBeTruthy();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      COPY['P-01a'],
      COPY['P-01b'],
    ]);
    // 내 프로필: 머리글 Remixed by·Derived by, 오른쪽 About your identity
    expect(screen.getByText(COPY['P-21']).parentElement?.textContent).toBe(`${COPY['P-21']} 2`);
    expect(await screen.findByRole('complementary', { name: COPY['P-23a'] })).toBeTruthy();
  });

  it('기록 0건이면 Identity 탭에 기록 중(P-17)이 보인다', async () => {
    await signIn('?fakeIdentity=none');
    renderAt(`/creators/${FAKE_CREATOR.id}`);
    // reasoned edits 는 값이 없어(reasonedRatio null) "—" 로 보인다(Work 탭 About 패널)
    expect((await screen.findByText(COPY['P-05'])).nextElementSibling?.textContent).toBe('—');
    const tab = await screen.findByRole('tab', { name: COPY['P-01b'] });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect((await screen.findAllByText(COPY['P-17'])).length).toBeGreaterThan(0);
  });

  it('남의 비공개 아이덴티티는 오류 없이 Identity 탭 좌표 자리에 P-20 을 보여 준다', async () => {
    await signIn('?fakeIdentity=private');
    renderAt(`/creators/${OTHER?.id ?? ''}`);
    expect(await screen.findByRole('heading', { level: 1, name: OTHER?.displayName })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    const tab = screen.getByRole('tab', { name: COPY['P-01b'] });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(await screen.findAllByText(COPY['P-20'])).toHaveLength(2);
    expect(screen.queryByText(COPY['P-17'])).toBeNull();
  });

  it('없는 사람이면 오류 안내와 다시 시도 버튼이 보인다', async () => {
    await signIn();
    renderAt('/creators/9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: COPY['E-01b'] })).toBeTruthy();
  });

  it('세션이 없으면 입장 화면으로 보낸다', async () => {
    resetFake();
    const router = renderAt(`/creators/${FAKE_CREATOR.id}`);
    expect(await screen.findByText('enter')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/enter');
  });
});

describe('Identity 탭 Other Creators 에서 리믹스로 들어가기(#41, Proto v7)', () => {
  async function openCompare() {
    await signIn();
    const router = renderAt(`/creators/${FAKE_CREATOR.id}`);
    const tab = await screen.findByRole('tab', { name: COPY['P-01b'] });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    return router;
  }
  const remixName = COPY['P-30'].replace('{name}', OTHER?.displayName ?? '');

  it('다른 창작자 줄의 화살표를 누르면 그 사람을 리믹스 상대로 새 프로젝트를 만들고 워크스페이스로 간다', async () => {
    const create = vi.spyOn(api, 'createProject');
    const router = await openCompare();
    fireEvent.click(await screen.findByRole('button', { name: remixName }));

    expect(await screen.findByText('workspace')).toBeTruthy();
    expect(create).toHaveBeenCalledWith({ remixPartnerId: OTHER?.id });
    expect(router.state.location.pathname).toMatch(/^\/projects\//);
  });

  it('연달아 눌러도 프로젝트는 한 번만 만든다', async () => {
    const create = vi.spyOn(api, 'createProject');
    await openCompare();
    const partner = await screen.findByRole('button', { name: remixName });
    fireEvent.click(partner);
    fireEvent.click(partner);
    await screen.findByText('workspace');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('만들기가 실패하면 오류 안내를 보이고 프로필에 남는다', async () => {
    vi.spyOn(api, 'createProject').mockRejectedValueOnce(
      new ApiRequestError(500, { code: 'INTERNAL', message: 'x', retryable: true }),
    );
    const router = await openCompare();
    fireEvent.click(await screen.findByRole('button', { name: remixName }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(router.state.location.pathname).toBe(`/creators/${FAKE_CREATOR.id}`);
  });
});
