import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, clearSession, setSession } from '../../shared/api';
import { FAKE_NOTICE_VERSION, FAKE_TOKEN } from '../../shared/api/fake/data';
import { fakeState, resetFake } from '../../shared/api/fake/state';
import { COPY } from '../../shared/copy';
import { WorkspacePage } from './WorkspacePage';

// 가짜 응답 모드에서 페이지 열기·추가, 프롬프트 보내기가 공용 API 로 이어지는지 본다.

const PROJECT = '7d2a9e44-6b3f-4c10-b5d8-9e0f1a2b3c4d';
const FIRST_PAGE = 'e9f3b1a7-5d2c-4b86-8f0a-3c4d5e6f7a8b';

function renderWorkspace(path = `/projects/${PROJECT}`) {
  const router = createMemoryRouter(
    [
      { path: '/projects/:id', element: <WorkspacePage /> },
      { path: '/', element: <p>home</p> },
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
  resetFake();
  fakeState.consented = true;
  setSession(FAKE_TOKEN, FAKE_NOTICE_VERSION);
});

afterEach(() => {
  clearSession();
  vi.restoreAllMocks();
});

describe('WorkspacePage', () => {
  it('?page= 가 있으면 그 페이지를, 없으면 마지막 페이지를 연다', async () => {
    const spy = vi.spyOn(api, 'getWorkspace');
    renderWorkspace(`/projects/${PROJECT}?page=${FIRST_PAGE}`);
    await screen.findByRole('button', { name: `${COPY['W-02']} 2` });
    expect(spy).toHaveBeenCalledWith(PROJECT, FIRST_PAGE);
  });

  it('인덱스에서 + 를 누르면 새 페이지를 만들고 그 페이지로 옮긴다', async () => {
    const router = renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: `${COPY['W-02']} 2` }));
    fireEvent.click(screen.getByRole('button', { name: COPY['W-03'] }));

    await screen.findByRole('button', { name: `${COPY['W-02']} 3` });
    const page = new URLSearchParams(router.state.location.search).get('page');
    expect(page).not.toBeNull();
    expect(page).not.toBe(FIRST_PAGE);
  });

  it('프롬프트를 보내면 세트를 만들고 입력칸을 비운다', async () => {
    const spy = vi.spyOn(api, 'createSet');
    renderWorkspace();
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'A lighthouse' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ prompt: 'A lighthouse' });
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(''));
  });

  it('세트 만들기가 실패하면 오류 문구를 보여 주고 입력 글은 남긴다', async () => {
    vi.spyOn(api, 'createSet').mockRejectedValue(new Error('down'));
    renderWorkspace();
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'A lighthouse' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByRole('alert')).not.toBeNull();
    expect((input as HTMLTextAreaElement).value).toBe('A lighthouse');
  });

  it('입력 안전 검사에 걸리면(422 SAFETY_BLOCKED) 생성 중 표시를 거두고 E-02 를 보여 준다', async () => {
    renderWorkspace();
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'A lighthouse' } });
    // 다음 요청(세트 만들기) 하나만 서버처럼 422 로 실패시킨다
    fakeState.pendingError = 'SAFETY_BLOCKED';
    fireEvent.keyDown(input, { key: 'Enter' });

    expect((await screen.findByRole('alert')).textContent).toContain(COPY['E-02']);
    expect(screen.queryByText(COPY['S-03'])).toBeNull();
    expect((input as HTMLTextAreaElement).value).toBe('A lighthouse');
  });
});
