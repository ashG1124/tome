import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CanvasRemixOptions } from '../../features/canvas';
import { FAKE_OTHER_CREATORS } from '../../shared/api/fake/identity';
import { JobStageSchema } from '@tome/shared';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiRequestError, clearSession, setSession } from '../../shared/api';
import { FAKE_NOTICE_VERSION, FAKE_TOKEN } from '../../shared/api/fake/data';
import { fakeState, resetFake } from '../../shared/api/fake/state';
import { COPY } from '../../shared/copy';
import * as downloadModule from './finish/download';
import { WorkspacePage } from './WorkspacePage';

// 캔버스(#26)는 그림 라이브러리가 jsdom 에 없는 ResizeObserver 를 써서, 이 화면 테스트에서는 자리 표시로 바꾼다.
// 캔버스 자체는 features/canvas 테스트와 e2e/canvas.spec.ts(실제 페이지 연결 상태)에서 본다.
vi.mock('../../features/canvas', () => ({
  WorkspaceCanvas: ({
    projectId,
    pageId,
    remix,
    onOpenResult,
  }: {
    projectId: string;
    pageId: string;
    remix?: CanvasRemixOptions;
    onOpenResult?: (answer: { id: string; imageUrl: string; title?: string }) => void;
  }) => (
    <div
      data-testid="canvas"
      data-project={projectId}
      data-page={pageId}
      data-connections={Object.values(remix?.connectionsByAnswer ?? {}).flat().length}
    >
      {/* 답변(그림) 카드 누름 대역(#230) */}
      <button
        type="button"
        onClick={() => onOpenResult?.({ id: 'answer-1', imageUrl: 'data:image/png;base64,ANSWER' })}
      >
        answer card
      </button>
      {/* 파생의 원작 답변 카드 누름 대역(#237): 원작 제목이 함께 온다 */}
      <button
        type="button"
        onClick={() =>
          onOpenResult?.({
            id: 'origin-1',
            imageUrl: 'data:image/png;base64,ORIGIN',
            title: 'Original title',
          })
        }
      >
        origin card
      </button>
    </div>
  ),
}));

// Radix 스위치는 form 안에서 크기를 재려고 ResizeObserver 를 쓴다. jsdom 에는 없어서 빈 대역을 둔다.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

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
  it('가운데에 캔버스를 놓고, 지금 프로젝트·페이지를 넘긴다', async () => {
    renderWorkspace(`/projects/${PROJECT}?page=${FIRST_PAGE}`);
    const canvas = await screen.findByTestId('canvas');
    expect(canvas.getAttribute('data-project')).toBe(PROJECT);
    expect(canvas.getAttribute('data-page')).toBe(FIRST_PAGE);
  });

  it('페이지를 바꾸면 캔버스에도 그 페이지를 넘긴다', async () => {
    renderWorkspace(`/projects/${PROJECT}?page=${FIRST_PAGE}`);
    fireEvent.click(await screen.findByRole('button', { name: `${COPY['W-02']} 2` }));
    const pages = screen.getAllByRole('button', { name: new RegExp(`^${COPY['W-01']} `) });
    const other = pages.find((button) => button.getAttribute('aria-current') !== 'page');
    if (other === undefined) throw new Error('다른 페이지 버튼이 없다');
    fireEvent.click(other);
    await waitFor(() =>
      expect(screen.getByTestId('canvas').getAttribute('data-page')).not.toBe(FIRST_PAGE),
    );
  });

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

  /** 답변이 하나 있는 프로젝트를 열고, 완료 모달에서 제목을 적고 Done 까지 누른다. */
  async function finishWithAnswer() {
    const { project } = await api.createProject({});
    const { currentPageId } = await api.getWorkspace(project.id);
    const { job } = await api.createSet(project.id, {
      pageId: currentPageId,
      prompt: 'A lighthouse',
    });
    for (const stage of JobStageSchema.options) await api.advanceJob(job.id, stage);
    const finish = vi.spyOn(api, 'finishProject');
    const router = renderWorkspace(`/projects/${project.id}`);

    fireEvent.click(await screen.findByRole('button', { name: COPY['W-04'] }));
    const title = await screen.findByRole('textbox', { name: COPY['D-03a'] });
    fireEvent.change(title, { target: { value: 'Lighthouse' } });
    await screen.findByRole('radio', { name: `${COPY['D-12']} 1` });
    fireEvent.click(screen.getByRole('button', { name: COPY['D-07b'] }));
    fireEvent.click(await screen.findByRole('button', { name: COPY['D-09b'] }));
    return { project, router, finish };
  }

  it('Done 이 성공하면 대표 버전을 크게 보여 주고, 닫으면 done 플래시와 함께 홈으로 간다(#124)', async () => {
    const { project, router, finish } = await finishWithAnswer();

    // 결과 크게 보기: 완료 모달은 닫히고 Download·닫기 버튼만 보인다. 아직 홈으로 가지 않는다.
    const download = await screen.findByRole('button', { name: COPY['D-13'] });
    expect(download).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: COPY['D-03a'] })).toBeNull();
    expect(router.state.location.pathname).toBe(`/projects/${project.id}`);
    expect(finish.mock.calls[0]?.[1]).toMatchObject({ title: 'Lighthouse' });

    fireEvent.click(screen.getByRole('button', { name: COPY['D-11'] }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.state).toEqual({ flash: 'done' });
  });

  it('결과 크게 보기에서 Esc 로 닫아도 홈으로 간다', async () => {
    const { router } = await finishWithAnswer();
    await screen.findByRole('button', { name: COPY['D-13'] });

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.state).toEqual({ flash: 'done' });
  });

  it('Download 를 누르면 대표 버전 그림을 받고, 받는 동안 버튼이 잠긴다', async () => {
    let finishDownload: () => void = () => {};
    const spy = vi.spyOn(downloadModule, 'downloadImage').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishDownload = resolve;
        }),
    );
    await finishWithAnswer();

    const button = (await screen.findByRole('button', { name: COPY['D-13'] })) as HTMLButtonElement;
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toMatch(/^data:image|\/assets\/answers\/.+\/full$/);

    finishDownload();
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Download 가 실패하면 오류 안내를 보이고, 크게 보기는 그대로 열려 있다', async () => {
    vi.spyOn(downloadModule, 'downloadImage').mockRejectedValue(new Error('network'));
    await finishWithAnswer();

    fireEvent.click(await screen.findByRole('button', { name: COPY['D-13'] }));
    expect((await screen.findByRole('alert')).textContent).toBe(COPY['E-01a']);
    expect(screen.getByRole('button', { name: COPY['D-13'] })).toBeTruthy();
  });
});

describe('WorkspacePage 답변 크게 보기(#230)', () => {
  it('캔버스의 답변 카드를 누르면 크게 보기가 열리고, Download 는 그 답변 그림을 받으며, 닫으면 캔버스에 머문다', async () => {
    const spy = vi.spyOn(downloadModule, 'downloadImage').mockResolvedValue();
    const router = renderWorkspace();
    const card = await screen.findByRole('button', { name: 'answer card' });
    card.focus();
    fireEvent.click(card);
    fireEvent.click(await screen.findByRole('button', { name: COPY['D-13'] }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]?.[0]).toBe('data:image/png;base64,ANSWER');

    fireEvent.click(screen.getByRole('button', { name: COPY['D-11'] }));
    await waitFor(() => expect(screen.queryByRole('button', { name: COPY['D-13'] })).toBeNull());
    expect(router.state.location.pathname).toBe(`/projects/${PROJECT}`);
    expect(router.state.location.state).toBeNull();
  });

  it('파생의 원작 답변 카드를 누르면 원작 그림을 원작 제목으로 크게 보고 받는다(#237)', async () => {
    const spy = vi.spyOn(downloadModule, 'downloadImage').mockResolvedValue();
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'origin card' }));
    const view = await screen.findByRole('dialog', { name: 'Original title' });
    expect(view.querySelector('img')?.getAttribute('alt')).toBe('Original title');
    fireEvent.click(await screen.findByRole('button', { name: COPY['D-13'] }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalledWith('data:image/png;base64,ORIGIN', 'Original title');
  });
});

describe('WorkspacePage 리믹스(#41)', () => {
  it('리믹스 버튼 → 후보 고르기 → 제목에 상대가 붙고, 패널이 닫히며 "Remix with 이름" 손잡이가 남는다', async () => {
    const spy = vi.spyOn(api, 'setRemixPartner');
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: COPY['RX-05'] }));
    fireEvent.click(await screen.findByRole('button', { name: /^Lind/ }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
        `${COPY['RX-04']} Lind`,
      ),
    );
    expect(spy).toHaveBeenCalledWith(PROJECT, expect.any(String));
    expect(screen.getByRole('button', { name: COPY['RX-05'] }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    const handles = screen
      .getAllByRole('button', { name: new RegExp(`${COPY['RX-01']} Lind`) })
      .filter((button) => button.hasAttribute('data-remix-handle'));
    expect(handles).toHaveLength(1);
  });

  it('고른 상대를 한 번 더 누르면 리믹스가 풀리고 제목에서 상대가 빠진다(#229)', async () => {
    const spy = vi.spyOn(api, 'setRemixPartner');
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: COPY['RX-05'] }));
    fireEvent.click(await screen.findByRole('button', { name: /^Lind/ }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
        `${COPY['RX-04']} Lind`,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: COPY['RX-05'] }));
    fireEvent.click(await screen.findByRole('button', { name: /^Lind/ }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).not.toContain(COPY['RX-04']),
    );
    expect(spy).toHaveBeenLastCalledWith(PROJECT, null);
  });

  it('후보가 0명이면(S-04) 리믹스 없이도 프롬프트로 일반 생성을 할 수 있다', async () => {
    resetFake('?fakeIdentity=private');
    fakeState.consented = true;
    const create = vi.spyOn(api, 'createSet');
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: COPY['RX-05'] }));
    expect((await screen.findByRole('status', { name: '' })).textContent).toBe(COPY['S-04']);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'A lighthouse' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  });

  it('상대 저장이 실패하면 패널 안에 오류를 보이고 제목은 그대로다', async () => {
    vi.spyOn(api, 'setRemixPartner').mockRejectedValueOnce(
      new ApiRequestError(403, { code: 'IDENTITY_PRIVATE', message: 'x', retryable: false }),
    );
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: COPY['RX-05'] }));
    fireEvent.click(await screen.findByRole('button', { name: /^Mara/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toContain(COPY['RX-04']);
  });
});

it('passes actual remix Connection data into the canvas public API', async () => {
  const partner = FAKE_OTHER_CREATORS[0]!;
  const { project, job } = await api.createProject({
    prompt: 'A lighthouse at dusk',
    remixPartnerId: partner.id,
  });
  if (!job) throw new Error('Missing job');
  for (const stage of JobStageSchema.options) await api.advanceJob(job.id, stage);
  renderWorkspace(`/projects/${project.id}`);
  await waitFor(() =>
    expect(Number(screen.getByTestId('canvas').getAttribute('data-connections'))).toBeGreaterThan(
      0,
    ),
  );
});
