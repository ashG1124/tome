import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProjectSummary } from '@tome/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, clearSession, setSession } from '../../shared/api';
import { FAKE_NOTICE_VERSION, FAKE_TOKEN } from '../../shared/api/fake/data';
import { resetFake } from '../../shared/api/fake/state';
import { HomePage } from './HomePage';

function project(id: string, title: string, shelfPosition: number): ProjectSummary {
  return {
    id,
    title,
    status: 'building',
    posted: false,
    coverThumbUrl: null,
    lastEditedAt: '2026-11-03T10:30:00.000Z',
    shelfPosition,
    kind: 'original',
  };
}

const A = project('0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c', 'Alpha', 0);
const B = project('7d2a9e44-6b3f-4c10-b5d8-9e0f1a2b3c4d', 'Bravo', 1);
const C = project('c4a1e7d2-8b5f-4e39-a6c0-2f1d3b4a5c6e', 'Charlie', 2);

function renderHome(projects: ProjectSummary[]) {
  vi.spyOn(api, 'listProjects').mockResolvedValue({ projects });
  const router = createMemoryRouter(
    [
      { path: '/', element: <HomePage /> },
      { path: '/projects/:id', element: <p>workspace</p> },
    ],
    { initialEntries: ['/'] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

async function cardTitles(): Promise<string[]> {
  const list = await screen.findByRole('list');
  return within(list)
    .getAllByRole('link')
    .map((link) => link.textContent ?? '');
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

describe('HomePage 서가', () => {
  it('받은 순서와 상관없이 서가 순서대로 카드를 놓는다', async () => {
    renderHome([C, A, B]);

    expect(await cardTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('카드 링크는 제목으로 읽히고 그 프로젝트 워크스페이스로 간다', async () => {
    renderHome([A]);

    const link = await screen.findByRole('link', { name: 'Alpha' });
    expect(link.getAttribute('href')).toBe(`/projects/${A.id}`);
  });

  it('마지막 편집일을 절대 날짜로 보여 준다', async () => {
    renderHome([A]);

    const time = (await screen.findByRole('list')).querySelector('time');
    expect(time?.getAttribute('dateTime')).toBe(A.lastEditedAt);
    expect(time?.textContent).toMatch(/2026/);
  });

  it('Alt+→ 로 카드를 한 칸 뒤로 옮기고 포커스는 그 카드에 남는다', async () => {
    renderHome([A, B, C]);
    const alpha = await screen.findByRole('link', { name: 'Alpha' });
    alpha.focus();

    fireEvent.keyDown(alpha, { key: 'ArrowRight', altKey: true });

    expect(await cardTitles()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Alpha' }));
  });

  it('Alt 없이 화살표만 누르면 순서를 바꾸지 않는다', async () => {
    renderHome([A, B, C]);
    const alpha = await screen.findByRole('link', { name: 'Alpha' });

    fireEvent.keyDown(alpha, { key: 'ArrowRight' });

    expect(await cardTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('맨 앞 카드는 더 앞으로 가지 않는다', async () => {
    renderHome([A, B, C]);
    const alpha = await screen.findByRole('link', { name: 'Alpha' });

    fireEvent.keyDown(alpha, { key: 'ArrowLeft', altKey: true });

    expect(await cardTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('카드를 드래그해서 다른 칸에 놓으면 순서가 바뀐다', async () => {
    renderHome([A, B, C]);
    const items = within(await screen.findByRole('list')).getAllByRole('listitem');

    fireEvent.dragStart(items[0] as HTMLElement);
    fireEvent.dragOver(items[2] as HTMLElement);
    fireEvent.drop(items[2] as HTMLElement);

    expect(await cardTitles()).toEqual(['Bravo', 'Charlie', 'Alpha']);
  });
});
