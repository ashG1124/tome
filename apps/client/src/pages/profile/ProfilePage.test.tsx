import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, clearSession, setSession } from '../../shared/api';
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

describe('프로필 화면 /creators/:id', () => {
  it('내 프로필을 받아 이름과 탭을 그린다', async () => {
    await signIn();
    renderAt(`/creators/${FAKE_CREATOR.id}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: FAKE_CREATOR.displayName }),
    ).toBeTruthy();
    expect(screen.getByRole('tab', { name: COPY['P-01a'] })).toBeTruthy();
    expect(screen.getByRole('tab', { name: COPY['P-01c'] })).toBeTruthy();
  });

  it('기록 0건이면 Identity 탭에 기록 중(P-17)이 보인다', async () => {
    await signIn('?fakeIdentity=none');
    renderAt(`/creators/${FAKE_CREATOR.id}`);
    const tab = await screen.findByRole('tab', { name: COPY['P-01b'] });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect((await screen.findAllByText(COPY['P-17'])).length).toBeGreaterThan(0);
    // Depth 는 값이 없어(reasonedRatio null) "—" 로 보인다
    expect(screen.getByText(COPY['P-05']).nextElementSibling?.textContent).toBe('—');
  });

  it('비공개 아이덴티티는 오류 없이 "기록 없음"으로 그린다', async () => {
    await signIn('?fakeIdentity=private');
    renderAt(`/creators/${OTHER?.id ?? ''}`);
    expect(await screen.findByRole('heading', { level: 1, name: OTHER?.displayName })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
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
