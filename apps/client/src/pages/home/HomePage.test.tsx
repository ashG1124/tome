import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProjectSummary } from '@tome/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, clearSession, NetworkError, setSession } from '../../shared/api';
import { FAKE_NOTICE_VERSION, FAKE_TOKEN } from '../../shared/api/fake/data';
import { resetFake } from '../../shared/api/fake/state';
import { COPY } from '../../shared/copy';
import { FLASH_MS } from './flash';
import { HomePage } from './HomePage';

/** 작업한 프로젝트의 썸네일(가짜 응답 모드처럼 바로 뜨는 data 주소). */
const THUMB = 'data:image/png;base64,AAAA';

function project(
  id: string,
  title: string,
  shelfPosition: number,
  extra: Partial<ProjectSummary> = {},
): ProjectSummary {
  return {
    id,
    title,
    status: 'building',
    posted: false,
    coverThumbUrl: THUMB,
    lastEditedAt: '2026-11-03T10:30:00.000Z',
    shelfPosition,
    kind: 'original',
    ...extra,
  };
}

const A = project('0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c', 'Alpha', 0);
const B = project('7d2a9e44-6b3f-4c10-b5d8-9e0f1a2b3c4d', 'Bravo', 1);
const C = project('c4a1e7d2-8b5f-4e39-a6c0-2f1d3b4a5c6e', 'Charlie', 2);
/** 아무 작업도 하지 않은 프로젝트(확정 답변이 없어 썸네일 주소가 없다) */
const EMPTY = project('e9f3b1a7-5d2c-4b86-8f0a-3c4d5e6f7a8b', 'Untitled', 1, {
  coverThumbUrl: null,
});

/**
 * jsdom 은 배치를 계산하지 않아서, 서가 칸 자리를 Figma 처럼 한 줄(칸 108px, 간격 20px)로 꾸며 준다.
 * li 의 형제 순서(0 = + Project)가 칸 번호다.
 */
function stubShelfGeometry() {
  const cellOf = (element: HTMLElement) =>
    element.tagName === 'LI' && element.parentElement
      ? Array.from(element.parentElement.children).indexOf(element)
      : 0;
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return cellOf(this) * 128;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(0);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(108);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(192);
}

const POINTER = { pointerId: 1, button: 0, isPrimary: true, pointerType: 'mouse' };

/** 카드를 (x, 0) 에서 눌러 dx 만큼 끈다. 떼지는 않는다. */
function pressAndMove(item: HTMLElement, dx: number) {
  fireEvent.pointerDown(item, { ...POINTER, clientX: 200, clientY: 100 });
  fireEvent.pointerMove(item, { ...POINTER, clientX: 200 + dx / 2, clientY: 100 });
  fireEvent.pointerMove(item, { ...POINTER, clientX: 200 + dx, clientY: 100 });
}

function renderHome(projects: ProjectSummary[], state?: unknown) {
  vi.spyOn(api, 'listProjects').mockResolvedValue({ projects });
  const router = createMemoryRouter(
    [
      { path: '/', element: <HomePage /> },
      { path: '/projects/:id', element: <p>workspace</p> },
    ],
    { initialEntries: [{ pathname: '/', state }] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** 서가 카드 제목(+ Project 칸은 링크가 아니라 빠진다) */
async function cardTitles(): Promise<string[]> {
  const list = await screen.findByRole('list');
  return within(list)
    .getAllByRole('link')
    .map((link) => link.textContent ?? '');
}

/** 카드 칸들(첫 칸 + Project 는 뺀다) */
async function cardItems(): Promise<HTMLElement[]> {
  return within(await screen.findByRole('list'))
    .getAllByRole('listitem')
    .slice(1);
}

beforeEach(() => {
  localStorage.clear();
  clearSession();
  resetFake();
  setSession(FAKE_TOKEN, FAKE_NOTICE_VERSION);
  // 저장 응답(옮긴 프로젝트)은 화면이 쓰지 않는다. 모양만 맞춰 돌려준다.
  vi.spyOn(api, 'updateProject').mockImplementation(async (id) => ({ project: { ...A, id } }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HomePage 서가', () => {
  it('첫 칸은 + Project, 그 뒤로 서가 순서대로 카드를 놓는다', async () => {
    renderHome([C, A, B]);

    const first = within(await screen.findByRole('list')).getAllByRole('listitem')[0];
    expect(within(first as HTMLElement).getByRole('button', { name: COPY['H-01'] })).toBeTruthy();
    expect(await cardTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('카드 링크는 제목으로 읽히고 그 프로젝트 워크스페이스로 간다', async () => {
    renderHome([A]);

    const link = await screen.findByRole('link', { name: 'Alpha' });
    expect(link.getAttribute('href')).toBe(`/projects/${A.id}`);
  });

  it('카드에 종류와 "Edited" 마지막 편집일(절대 날짜)이 들어 있다(넓어질 때 보임)', async () => {
    renderHome([A]);

    const card = (await cardItems())[0] as HTMLElement;
    expect(card.textContent).toContain(COPY['H-03a']);
    const time = card.querySelector('time');
    expect(time?.getAttribute('dateTime')).toBe(A.lastEditedAt);
    expect(time?.textContent).toMatch(/2026/);
    expect(card.textContent).toContain(COPY['H-04']);
  });

  it('완료했으면 Finished, 게시까지 했으면 Finished·Posted 태그를 붙인다', async () => {
    renderHome([
      project(A.id, 'Alpha', 0, { status: 'finished' }),
      project(B.id, 'Bravo', 1, { status: 'finished', posted: true }),
      C,
    ]);

    const [alpha, bravo, charlie] = await cardItems();
    expect(alpha?.textContent).toContain(COPY['H-02b']);
    expect(alpha?.textContent).not.toContain(COPY['H-02a']);
    expect(bravo?.textContent).toContain(COPY['H-02b']);
    expect(bravo?.textContent).toContain(COPY['H-02a']);
    expect(charlie?.textContent).not.toContain(COPY['H-02b']);
  });

  it('Alt+→ 로 카드를 한 칸 뒤로 옮기고 저장한다. 포커스는 그 카드에 남는다', async () => {
    renderHome([A, B, C]);
    const alpha = await screen.findByRole('link', { name: 'Alpha' });
    alpha.focus();

    fireEvent.keyDown(alpha, { key: 'ArrowRight', altKey: true });

    expect(await cardTitles()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Alpha' }));
    expect(api.updateProject).toHaveBeenCalledWith(A.id, { shelfPosition: 1 });
    expect(screen.getByText('Moved to position 2 of 3.').getAttribute('role')).toBe('status');
  });

  it('Alt 없이 화살표만 누르거나 맨 앞에서 더 앞으로 가면 바꾸지 않는다', async () => {
    renderHome([A, B, C]);
    const alpha = await screen.findByRole('link', { name: 'Alpha' });

    fireEvent.keyDown(alpha, { key: 'ArrowRight' });
    fireEvent.keyDown(alpha, { key: 'ArrowLeft', altKey: true });

    expect(await cardTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(api.updateProject).not.toHaveBeenCalled();
  });

  it('카드를 마우스로 잡아 끌면 포인터를 따라가고, 다른 카드는 놓일 자리로 미리 비켜 선다', async () => {
    stubShelfGeometry();
    renderHome([A, B, C]);
    const [alpha, bravo, charlie] = (await cardItems()) as [HTMLElement, HTMLElement, HTMLElement];

    pressAndMove(alpha, 256);

    expect(alpha.style.transform).toBe('translate(256px, 0px)');
    expect(alpha.querySelector('[data-lifted]')).not.toBeNull();
    // Alpha 를 Charlie 자리에 놓을 참이라 Bravo·Charlie 가 한 칸씩 앞으로 비켜 선다
    expect(bravo.style.transform).toBe('translate(-128px, 0px)');
    expect(charlie.style.transform).toBe('translate(-128px, 0px)');
    expect(api.updateProject).not.toHaveBeenCalled();
  });

  it('끌어서 다른 칸에 놓으면 순서가 바뀌고 저장하며, 옮긴 자리를 낭독한다', async () => {
    stubShelfGeometry();
    const router = renderHome([A, B, C]);
    const [alpha] = (await cardItems()) as [HTMLElement];

    pressAndMove(alpha, 256);
    fireEvent.pointerUp(alpha, { ...POINTER, clientX: 456, clientY: 100 });
    // 끌기 뒤 따라오는 click 은 프로젝트를 열지 않는다
    fireEvent.click(within(alpha).getByRole('link'));

    expect(await cardTitles()).toEqual(['Bravo', 'Charlie', 'Alpha']);
    expect(api.updateProject).toHaveBeenCalledWith(A.id, { shelfPosition: 2 });
    expect(screen.getByText('Moved to position 3 of 3.').getAttribute('role')).toBe('status');
    expect(router.state.location.pathname).toBe('/');
  });

  it('기준 거리(6px)보다 적게 움직이고 떼면 끌기가 아니라 클릭이라 프로젝트로 들어간다', async () => {
    stubShelfGeometry();
    const router = renderHome([A, B, C]);
    const [alpha] = (await cardItems()) as [HTMLElement];

    pressAndMove(alpha, 4);
    expect(alpha.style.transform).toBe('');
    fireEvent.pointerUp(alpha, { ...POINTER, clientX: 204, clientY: 100 });
    fireEvent.click(within(alpha).getByRole('link'));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/projects/${A.id}`));
    expect(api.updateProject).not.toHaveBeenCalled();
  });

  it('끄는 중 Escape 를 누르면 취소하고 순서를 그대로 둔다', async () => {
    stubShelfGeometry();
    renderHome([A, B, C]);
    const [alpha, bravo] = (await cardItems()) as [HTMLElement, HTMLElement];

    pressAndMove(alpha, 256);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.pointerUp(alpha, { ...POINTER, clientX: 456, clientY: 100 });

    expect(await cardTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(bravo.style.transform).toBe('');
    expect(api.updateProject).not.toHaveBeenCalled();
  });

  it('아무 작업도 하지 않은(썸네일 주소가 없는) 프로젝트는 서가에 카드를 만들지 않는다', async () => {
    renderHome([A, EMPTY, B]);

    expect(await cardTitles()).toEqual(['Alpha', 'Bravo']);
    expect(screen.queryByRole('link', { name: 'Untitled' })).toBeNull();
  });

  it('카드가 없는 작업 전 프로젝트도 가장 최근이면 Recent Work 로 이어서 열 수 있다', async () => {
    renderHome([A, { ...EMPTY, lastEditedAt: '2026-11-04T09:00:00.000Z' }]);
    await screen.findByRole('link', { name: 'Alpha' });

    fireEvent.click(screen.getByRole('button', { name: COPY['RW-01'] }));

    expect(screen.getByRole('link', { name: `${COPY['RW-01']}: Untitled` })).toBeTruthy();
  });

  it('작업 전 프로젝트만 있으면 빈 서가 안내(S-01)를 보여 준다', async () => {
    renderHome([EMPTY]);

    expect(await screen.findByText(COPY['S-01'])).toBeTruthy();
    expect(within(screen.getByRole('list')).queryAllByRole('link')).toHaveLength(0);
  });

  it('숨긴 빈 프로젝트가 사이에 있어도 저장 순번은 서가 전체 기준으로 보낸다', async () => {
    renderHome([A, EMPTY, B, C]);
    const alpha = await screen.findByRole('link', { name: 'Alpha' });

    fireEvent.keyDown(alpha, { key: 'ArrowRight', altKey: true });

    expect(await cardTitles()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    // 전체 [Alpha, Untitled, Bravo, Charlie] → Charlie 바로 앞(전체 순번 2)
    expect(api.updateProject).toHaveBeenCalledWith(A.id, { shelfPosition: 2 });
  });

  it('카드 링크는 순서 옮기기 키 안내를 설명으로 가진다', async () => {
    renderHome([A]);

    const link = await screen.findByRole('link', { name: 'Alpha' });
    const hint = document.getElementById(link.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toBe(COPY['H-05']);
  });

  it('순서 저장이 실패하면 원래 자리로 되돌리고 E-03 을 보여 준다', async () => {
    vi.spyOn(api, 'updateProject').mockRejectedValue(new NetworkError());
    renderHome([A, B, C]);
    const alpha = await screen.findByRole('link', { name: 'Alpha' });

    fireEvent.keyDown(alpha, { key: 'ArrowRight', altKey: true });

    expect((await screen.findByRole('alert')).textContent).toContain(COPY['E-03']);
    expect(await cardTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('+ Project 를 연달아 눌러도 한 번만 만들고, 새 프로젝트 화면으로 간다', async () => {
    let finish: (value: { project: ProjectSummary }) => void = () => undefined;
    const create = vi.spyOn(api, 'createProject').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const router = renderHome([A]);
    const add = await screen.findByRole('button', { name: COPY['H-01'] });

    fireEvent.click(add);
    fireEvent.click(add);
    expect(create).toHaveBeenCalledTimes(1);

    finish({ project: B });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/projects/${B.id}`));
  });

  it('서가가 비어 있으면 + Project 칸과 S-01 안내를 보여 준다', async () => {
    renderHome([]);

    expect(await screen.findByRole('button', { name: COPY['H-01'] })).toBeTruthy();
    expect(screen.getByText(COPY['S-01'])).toBeTruthy();
    expect(within(screen.getByRole('list')).queryAllByRole('link')).toHaveLength(0);
  });

  it('서가 뒤에 점선 격자 무늬를 깔고, 장식이라 화면 낭독기에서 숨긴다', async () => {
    renderHome([A]);
    await screen.findByRole('list');

    const grid = document.querySelector('[data-shelf-grid]');
    expect(grid).not.toBeNull();
    expect(grid?.getAttribute('aria-hidden')).toBe('true');
  });

  it('워크스페이스에서 돌아오면 Update 플래시를 띄우고, 잠시 뒤 지운다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const router = renderHome([], { flash: 'update' });
    const status = await screen.findByText(COPY['W-05']);
    expect(status.closest('[role="status"]')).not.toBeNull();
    // 새로고침해도 다시 뜨지 않게 주소의 state 를 지웠다
    await waitFor(() => expect(router.state.location.state).toBeNull());
    await act(() => vi.advanceTimersByTimeAsync(FLASH_MS));
    expect(screen.queryByText(COPY['W-05'])).toBeNull();
    vi.useRealTimers();
  });

  it('완료하고 오면 done 플래시를 띄운다', async () => {
    renderHome([], { flash: 'done' });
    expect(await screen.findByText(COPY['D-10'])).not.toBeNull();
  });
});
