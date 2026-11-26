import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProjectSummary } from '@tome/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ShelfCard } from './ShelfCard';

const BASE: ProjectSummary = {
  id: '0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c',
  title: 'Alpha',
  status: 'building',
  posted: false,
  coverThumbUrl: null,
  lastEditedAt: '2026-11-03T10:30:00.000Z',
  shelfPosition: 0,
  kind: 'original',
};

function renderCard(extra: Partial<ProjectSummary> = {}): HTMLElement {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <ShelfCard project={{ ...BASE, ...extra }} openToLeft={false} onMove={() => {}} />,
      },
    ],
    { initialEntries: ['/'] },
  );
  // 카드가 표지를 받을 때 TanStack Query 를 쓰므로 테스트에도 깔아 준다.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  ).container;
}

function coverState(container: HTMLElement): string | null {
  return container.querySelector('[data-cover]')?.getAttribute('data-cover') ?? null;
}

function coverImage(container: HTMLElement): HTMLImageElement {
  const image = container.querySelector('img');
  if (image === null) throw new Error('표지 사진이 없다');
  return image;
}

function titleHidden(): boolean {
  return screen.getByRole('link', { name: 'Alpha' }).classList.contains('opacity-0');
}

describe('ShelfCard 표지 사진', () => {
  it('사진 주소가 없어도 기본은 제목을 화면에서만 숨기고, hover·focus 때 보이게 하는 클래스를 가진다', () => {
    const container = renderCard();
    expect(container.querySelector('img')).toBeNull();
    expect(coverState(container)).toBe('none');
    expect(titleHidden()).toBe(true);
    const link = screen.getByRole('link', { name: 'Alpha' });
    expect(link.className).toContain('group-hover:opacity-100');
    expect(link.className).toContain('group-focus-within:opacity-100');
    expect(link.className).toContain('motion-reduce:transition-none');
  });

  it('사진이 다 뜨기 전에는 사진 없는 면 그대로, 뜨고 나면 제목을 화면에서만 숨긴다', () => {
    const container = renderCard({ coverThumbUrl: 'https://example.test/cover.png' });
    const image = coverImage(container);
    expect(image.getAttribute('alt')).toBe('');
    expect(coverState(container)).toBe('loading');
    expect(titleHidden()).toBe(true);

    fireEvent.load(image);
    expect(coverState(container)).toBe('shown');
    // 링크 이름(제목)은 그대로 남아 Tab·화면 낭독기로 찾을 수 있다
    expect(titleHidden()).toBe(true);
  });

  it('사진을 못 받으면 사진을 치우고 사진 없는 면으로 돌아간다', () => {
    const container = renderCard({ coverThumbUrl: 'https://example.test/missing.png' });
    fireEvent.error(coverImage(container));
    expect(container.querySelector('img')).toBeNull();
    expect(coverState(container)).toBe('failed');
    expect(titleHidden()).toBe(true);
  });
});

function renderWith(props: Partial<Parameters<typeof ShelfCard>[0]>): HTMLElement {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <ShelfCard project={BASE} openToLeft={false} onMove={() => {}} {...props} />,
      },
    ],
    { initialEntries: ['/'] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  ).container;
}

describe('ShelfCard 상자 누르기·옮기기 (#227)', () => {
  it('링크 하나가 카드 상자 전체를 덮어(안쪽 여백까지) 상자 어디를 눌러도 들어간다', () => {
    const container = renderWith({});
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    const link = links[0] as HTMLAnchorElement;
    expect(link.className).toContain('after:absolute');
    expect(link.className).toContain('after:inset-[calc(var(--space-padding-4)*-1)]');
    // 브라우저 기본 링크 끌기는 끈다(끌기는 서가 pointer 이벤트가 맡는다)
    expect(link.getAttribute('draggable')).toBe('false');
  });

  it('Alt+화살표는 그 방향 옆 칸으로 옮기고, Alt 없는 화살표는 무시한다 (#240)', () => {
    const moves: string[] = [];
    renderWith({ onMove: (direction) => moves.push(direction) });
    const link = screen.getByRole('link', { name: 'Alpha' });

    fireEvent.keyDown(link, { key: 'ArrowLeft', altKey: true });
    fireEvent.keyDown(link, { key: 'ArrowRight', altKey: true });
    fireEvent.keyDown(link, { key: 'ArrowUp', altKey: true });
    fireEvent.keyDown(link, { key: 'ArrowDown', altKey: true });
    fireEvent.keyDown(link, { key: 'ArrowDown' });

    expect(moves).toEqual(['left', 'right', 'up', 'down']);
  });

  it('끌려 다니는 동안(lifted)은 hover·focus 로 넓어지지 않게 group 을 빼고 그림자를 띄운다', () => {
    const container = renderWith({ lifted: true });
    const card = container.querySelector('[data-cover]') as HTMLElement;
    expect(card.getAttribute('data-lifted')).toBe('true');
    expect(card.classList.contains('group')).toBe(false);
    expect(card.firstElementChild?.className).toContain('shadow-[var(--shadow-floating)]');
  });
});
