import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProjectSummary } from '@tome/shared';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiRequestError, clearSession, NetworkError, setSession } from '../../shared/api';
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
 * jsdom 은 배치를 계산하지 않아서, 서가 목록의 격자 치수를 Figma 값으로 꾸며 준다
 * (여백·간격 20px, 칸 108×192 → 가로 128·세로 212 간격, 폭 1686 → 한 줄 13칸).
 */
function stubShelfGeometry() {
  const real = window.getComputedStyle.bind(window);
  const values: Record<string, string> = {
    paddingLeft: '20px',
    paddingRight: '20px',
    paddingTop: '20px',
    columnGap: '20px',
    rowGap: '20px',
  };
  const tokens: Record<string, string> = {
    '--size-shelf-card-width': '108px',
    '--size-shelf-card-height': '192px',
  };
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const styles = real(element, pseudo);
    if (!(element instanceof HTMLOListElement)) return styles;
    return new Proxy(styles, {
      get(target, prop) {
        if (prop === 'getPropertyValue') {
          return (name: string) => tokens[name] ?? target.getPropertyValue(name);
        }
        if (typeof prop === 'string' && prop in values) return values[prop];
        const value: unknown = Reflect.get(target, prop);
        return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
      },
    });
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1686);
}

const POINTER = { pointerId: 1, button: 0, isPrimary: true, pointerType: 'mouse' };

/** 카드를 (200, 100) 에서 눌러 (dx, dy) 만큼 끈다. 떼지는 않는다. */
function pressAndMove(item: HTMLElement, dx: number, dy = 0) {
  fireEvent.pointerDown(item, { ...POINTER, clientX: 200, clientY: 100 });
  fireEvent.pointerMove(item, { ...POINTER, clientX: 200 + dx / 2, clientY: 100 + dy / 2 });
  fireEvent.pointerMove(item, { ...POINTER, clientX: 200 + dx, clientY: 100 + dy });
}

/** 카드 칸 자리(data-cell = "col,row") */
async function cellOfTitle(title: string): Promise<string | null> {
  const link = await screen.findByRole('link', { name: title });
  return link.closest('li')?.getAttribute('data-cell') ?? null;
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

  it('카드는 + Project 다음 칸부터 서가 순서대로 격자 칸에 놓인다 (#240)', async () => {
    renderHome([A, B, C]);
    expect(await cellOfTitle('Alpha')).toBe('1,0');
    expect(await cellOfTitle('Bravo')).toBe('2,0');
    expect(await cellOfTitle('Charlie')).toBe('3,0');
  });

  it('Alt+→ 로 옆 칸 카드와 자리를 맞바꾸고 저장한다. 포커스는 그 카드에 남는다', async () => {
    renderHome([A, B, C]);
    const alpha = await screen.findByRole('link', { name: 'Alpha' });
    alpha.focus();

    fireEvent.keyDown(alpha, { key: 'ArrowRight', altKey: true });

    expect(await cardTitles()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(await cellOfTitle('Alpha')).toBe('2,0');
    expect(await cellOfTitle('Bravo')).toBe('1,0');
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Alpha' }));
    expect(api.updateProject).toHaveBeenCalledWith(A.id, { shelfPosition: 1 });
    expect(screen.getByText('Moved to row 1, column 3.').getAttribute('role')).toBe('status');
  });

  it('Alt+↓ 로 아래 빈 칸에 놓고(서가가 한 줄 늘어난다), 새로고침해도 그 자리에 있다 (#240)', async () => {
    const first = renderHome([A, B, C]);
    const alpha = await screen.findByRole('link', { name: 'Alpha' });
    alpha.focus();

    fireEvent.keyDown(alpha, { key: 'ArrowDown', altKey: true });

    expect(await cellOfTitle('Alpha')).toBe('1,1');
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Alpha' }));
    expect(screen.getByText('Moved to row 2, column 2.').getAttribute('role')).toBe('status');
    // 읽는 순서(위→아래, 왼→오른쪽)가 서버 서가 순서가 된다
    expect(await cardTitles()).toEqual(['Bravo', 'Charlie', 'Alpha']);
    expect(api.updateProject).toHaveBeenCalledWith(A.id, { shelfPosition: 2 });
    const list = await screen.findByRole('list');
    expect(list.style.gridTemplateRows).toContain('repeat(3,');
    expect(Object.keys(localStorage).some((key) => key.startsWith('tome.home.layout.'))).toBe(true);

    first.dispose();
    cleanup();
    renderHome([A, B, C]);
    expect(await cellOfTitle('Alpha')).toBe('1,1');
    expect(await cellOfTitle('Bravo')).toBe('2,0');
  });

  it('Alt 없이 화살표만 누르거나 맨 앞에서 더 앞으로 가면 바꾸지 않는다', async () => {
    renderHome([A, B, C]);
    const alpha = await screen.findByRole('link', { name: 'Alpha' });

    fireEvent.keyDown(alpha, { key: 'ArrowRight' });
    fireEvent.keyDown(alpha, { key: 'ArrowLeft', altKey: true });

    expect(await cardTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(api.updateProject).not.toHaveBeenCalled();
  });

  it('카드를 마우스로 잡아 끌면 포인터를 따라가고, 놓일 칸의 카드만 원래 칸으로 미리 비켜 선다', async () => {
    stubShelfGeometry();
    renderHome([A, B, C]);
    const [alpha, bravo, charlie] = (await cardItems()) as [HTMLElement, HTMLElement, HTMLElement];

    pressAndMove(alpha, 256);

    expect(alpha.style.transform).toBe('translate(256px, 0px)');
    expect(alpha.querySelector('[data-lifted]')).not.toBeNull();
    // Alpha 를 Charlie 칸에 놓을 참이라 Charlie 만 Alpha 칸으로 비켜 서고 Bravo 는 그대로
    expect(charlie.style.transform).toBe('translate(-256px, 0px)');
    expect(bravo.style.transform).toBe('');
    // 놓일 칸 자리 표시(장식)
    const drop = document.querySelector<HTMLElement>('[data-shelf-drop]');
    expect(drop?.getAttribute('aria-hidden')).toBe('true');
    expect(drop?.style.left).toContain('* 3');
    expect(api.updateProject).not.toHaveBeenCalled();
  });

  it('끌어서 다른 카드 칸에 놓으면 맞바꾸고 저장하며, 옮긴 자리를 낭독한다', async () => {
    stubShelfGeometry();
    const router = renderHome([A, B, C]);
    const [alpha] = (await cardItems()) as [HTMLElement];

    pressAndMove(alpha, 256);
    fireEvent.pointerUp(alpha, { ...POINTER, clientX: 456, clientY: 100 });
    // 끌기 뒤 따라오는 click 은 프로젝트를 열지 않는다
    fireEvent.click(within(alpha).getByRole('link'));

    expect(await cardTitles()).toEqual(['Charlie', 'Bravo', 'Alpha']);
    expect(await cellOfTitle('Charlie')).toBe('1,0');
    expect(await cellOfTitle('Alpha')).toBe('3,0');
    await waitFor(() => expect(api.updateProject).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Moved to row 1, column 4.').getAttribute('role')).toBe('status');
    expect(router.state.location.pathname).toBe('/');
    expect(document.querySelector('[data-shelf-drop]')).toBeNull();
  });

  it('끌어서 서가 아무 빈 칸에나 놓을 수 있다(격자 칸에 붙는다) (#240)', async () => {
    stubShelfGeometry();
    renderHome([A, B, C]);
    const [alpha] = (await cardItems()) as [HTMLElement];

    // 오른쪽 5칸 반, 아래 1줄 조금 넘게 → (6, 1) 칸
    pressAndMove(alpha, 128 * 5 + 50, 212 + 30);
    fireEvent.pointerUp(alpha, { ...POINTER, clientX: 200 + 690, clientY: 100 + 242 });

    expect(await cellOfTitle('Alpha')).toBe('6,1');
    expect(await cellOfTitle('Bravo')).toBe('2,0');
    expect(await cardTitles()).toEqual(['Bravo', 'Charlie', 'Alpha']);
    expect(api.updateProject).toHaveBeenCalledWith(A.id, { shelfPosition: 2 });
    expect(screen.getByText('Moved to row 2, column 7.').getAttribute('role')).toBe('status');
  });

  it('+ Project 칸에 놓으면 제자리로 돌아간다', async () => {
    stubShelfGeometry();
    renderHome([A, B, C]);
    const [alpha] = (await cardItems()) as [HTMLElement];

    pressAndMove(alpha, -128);
    fireEvent.pointerUp(alpha, { ...POINTER, clientX: 72, clientY: 100 });

    expect(await cellOfTitle('Alpha')).toBe('1,0');
    expect(api.updateProject).not.toHaveBeenCalled();
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
    expect(await cellOfTitle('Alpha')).toBe('1,0');
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
    expect(hint?.textContent).toBe(`${COPY['H-05']} ${COPY['H-11']}`);
  });

  it('순서 저장이 실패하면 원래 자리로 되돌리고 E-03 을 보여 준다', async () => {
    vi.spyOn(api, 'updateProject').mockRejectedValue(new NetworkError());
    renderHome([A, B, C]);
    const alpha = await screen.findByRole('link', { name: 'Alpha' });

    fireEvent.keyDown(alpha, { key: 'ArrowRight', altKey: true });

    expect((await screen.findByRole('alert')).textContent).toContain(COPY['E-03']);
    expect(await cardTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(await cellOfTitle('Alpha')).toBe('1,0');
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

describe('HomePage 서가 — 우클릭으로 지우기 (#254)', () => {
  /** 서버처럼 지운 프로젝트를 목록에서 빼고 돌려준다(다시 받아도 돌아오지 않게). */
  function serveShelf(projects: ProjectSummary[]) {
    const gone = new Set<string>();
    const remove = vi.spyOn(api, 'deleteProject').mockImplementation(async (id) => {
      gone.add(id);
    });
    const router = renderHome(projects);
    vi.mocked(api.listProjects).mockImplementation(async () => ({
      projects: projects.filter((item) => !gone.has(item.id)),
    }));
    return { remove, router };
  }

  async function openMenuOn(title: string) {
    const link = await screen.findByRole('link', { name: title });
    fireEvent.contextMenu(link.closest('li') as HTMLElement, { clientX: 300, clientY: 200 });
    return screen.findByRole('menu', { name: `Options for ${title}` });
  }

  async function confirmDelete() {
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: COPY['S-07b'] }));
    return dialog;
  }

  it('카드를 우클릭하면 브라우저 메뉴 대신 Delete 메뉴가 뜨고 첫 항목에 포커스가 간다', async () => {
    serveShelf([A, B]);
    const link = await screen.findByRole('link', { name: 'Alpha' });
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    act(() => {
      link.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    const menu = await screen.findByRole('menu', { name: 'Options for Alpha' });
    const item = within(menu).getByRole('menuitem', { name: COPY['S-07b'] });
    expect(document.activeElement).toBe(item);
  });

  it('카드가 아닌 곳의 우클릭은 막지 않는다', async () => {
    serveShelf([A]);
    await screen.findByRole('link', { name: 'Alpha' });
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Esc 는 메뉴를 닫고 카드로 포커스를 돌려준다. 바깥을 눌러도 닫힌다', async () => {
    serveShelf([A, B]);
    const menu = await openMenuOn('Alpha');
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Alpha' }));

    await openMenuOn('Alpha');
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Delete → 확인 창(Cancel 에 포커스). 지우면 카드가 빠지고 플래시를 띄우고 다음 카드로 포커스가 간다', async () => {
    const { remove } = serveShelf([A, B, C]);
    const menu = await openMenuOn('Alpha');
    fireEvent.click(within(menu).getByRole('menuitem', { name: COPY['S-07b'] }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete “Alpha”?' });
    expect(within(dialog).getByText(COPY['H-09'])).toBeTruthy();
    const cancel = within(dialog).getByRole('button', { name: COPY['D-09a'] });
    expect(document.activeElement).toBe(cancel);

    await confirmDelete();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(remove).toHaveBeenCalledWith(A.id);
    expect(await cardTitles()).toEqual(['Bravo', 'Charlie']);
    expect(screen.getByText(COPY['H-10']).closest('[role="status"]')).not.toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Bravo' })),
    );
  });

  it('지워도 남은 카드는 제자리에 있고, 저장한 자리에서 지운 카드는 빠진다', async () => {
    serveShelf([A, B, C]);
    const menu = await openMenuOn('Bravo');
    fireEvent.click(within(menu).getByRole('menuitem'));
    await confirmDelete();

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Bravo' })).toBeNull());
    expect(await cellOfTitle('Alpha')).toBe('1,0');
    expect(await cellOfTitle('Charlie')).toBe('3,0');
    const key = Object.keys(localStorage).find((name) => name.startsWith('tome.home.layout.'));
    const stored = JSON.parse(localStorage.getItem(key ?? '') ?? '{}') as {
      cells: Record<string, unknown>;
    };
    expect(Object.keys(stored.cells).sort()).toEqual([A.id, C.id].sort());
  });

  it('마지막 카드를 지우면 빈 서가 안내가 뜨고 + Project 로 포커스가 간다', async () => {
    serveShelf([A]);
    const menu = await openMenuOn('Alpha');
    fireEvent.click(within(menu).getByRole('menuitem'));
    await confirmDelete();

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Alpha' })).toBeNull());
    expect(screen.getByText(COPY['S-01'])).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: COPY['H-01'] })),
    );
  });

  it('Cancel 하면 지우지 않고 그 카드로 포커스를 돌려준다', async () => {
    const { remove } = serveShelf([A, B]);
    const menu = await openMenuOn('Bravo');
    fireEvent.click(within(menu).getByRole('menuitem'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: COPY['D-09a'] }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(remove).not.toHaveBeenCalled();
    expect(await cardTitles()).toEqual(['Alpha', 'Bravo']);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Bravo' })),
    );
  });

  it('Shift+F10·메뉴 키로도 같은 메뉴가 열리고, 고르면 확인 창이 뜬다', async () => {
    serveShelf([A, B]);
    const alpha = await screen.findByRole('link', { name: 'Alpha' });
    alpha.focus();
    fireEvent.keyDown(alpha, { key: 'F10', shiftKey: true });
    const menu = await screen.findByRole('menu', { name: 'Options for Alpha' });
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem'));
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(document.activeElement).toBe(alpha);

    const bravo = screen.getByRole('link', { name: 'Bravo' });
    bravo.focus();
    fireEvent.keyDown(bravo, { key: 'ContextMenu' });
    const second = await screen.findByRole('menu', { name: 'Options for Bravo' });
    // 화살표는 항목 사이를 돈다(항목이 하나라 그대로).
    fireEvent.keyDown(second, { key: 'ArrowDown' });
    const item = within(second).getByRole('menuitem');
    expect(document.activeElement).toBe(item);
    fireEvent.click(item);
    expect(await screen.findByRole('dialog', { name: 'Delete “Bravo”?' })).toBeTruthy();
  });

  it('지우기가 실패하면 창 안에 오류(role=alert)를 띄우고 창과 카드는 그대로 둔다', async () => {
    serveShelf([A, B]);
    vi.mocked(api.deleteProject).mockRejectedValueOnce(new NetworkError());
    const menu = await openMenuOn('Alpha');
    fireEvent.click(within(menu).getByRole('menuitem'));
    const dialog = await confirmDelete();

    expect((await within(dialog).findByRole('alert')).textContent).toContain(COPY['E-03']);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(
      (within(dialog).getByRole('button', { name: COPY['S-07b'] }) as HTMLButtonElement).disabled,
    ).toBe(false);
    // 창이 열려 있는 동안 뒤 화면은 낭독기에서 숨겨진다(hidden 포함으로 찾는다).
    expect(screen.getByRole('link', { name: 'Alpha', hidden: true })).toBeTruthy();
  });

  it('보내는 동안은 두 버튼을 잠그고 Esc 로 닫히지 않는다', async () => {
    serveShelf([A]);
    let finish: () => void = () => undefined;
    vi.mocked(api.deleteProject).mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finish = () => resolve(undefined);
        }),
    );
    const menu = await openMenuOn('Alpha');
    fireEvent.click(within(menu).getByRole('menuitem'));
    const dialog = await confirmDelete();
    const confirm = within(dialog).getByRole('button', { name: COPY['S-07b'] });

    expect(confirm.getAttribute('aria-busy')).toBe('true');
    expect(
      (within(dialog).getByRole('button', { name: COPY['D-09a'] }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBe(dialog);
    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('이미 지워진 프로젝트(404)는 지운 것으로 보고 서가에서 뺀다', async () => {
    serveShelf([A, B]);
    // 다른 곳에서 이미 지워서 서버 목록에도 없다.
    vi.mocked(api.listProjects).mockResolvedValue({ projects: [B] });
    vi.mocked(api.deleteProject).mockRejectedValueOnce(
      new ApiRequestError(404, { code: 'NOT_FOUND', message: 'NOT_FOUND', retryable: false }),
    );
    const menu = await openMenuOn('Alpha');
    fireEvent.click(within(menu).getByRole('menuitem'));
    await confirmDelete();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await cardTitles()).toEqual(['Bravo']);
  });

  it('왼쪽 버튼이 아니면 끌기를 시작하지 않는다(우클릭한 채 움직여도 그대로)', async () => {
    stubShelfGeometry();
    serveShelf([A, B]);
    const [alpha] = (await cardItems()) as [HTMLElement];
    fireEvent.pointerDown(alpha, { ...POINTER, button: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(alpha, { ...POINTER, button: 2, clientX: 300, clientY: 100 });
    expect(alpha.querySelector('[data-lifted]')).toBeNull();
    fireEvent.contextMenu(alpha, { clientX: 300, clientY: 100 });
    expect(await screen.findByRole('menu')).toBeTruthy();
  });
});
