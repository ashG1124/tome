import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProjectSummary } from '@tome/shared';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, setSession } from '../../shared/api';
import type * as ConfigModule from '../../shared/api/config';
import { ShelfCard } from './ShelfCard';

// 서버 모드로 바꿔서, 표지를 로그인 토큰으로 받아 오는 길을 확인한다.
vi.mock('../../shared/api/config', async (importOriginal) => {
  const actual = await importOriginal<typeof ConfigModule>();
  return {
    ...actual,
    apiConfig: { ...actual.apiConfig, mode: 'live', baseUrl: 'https://api.example.test' },
  };
});

const COVER_PATH = '/assets/answers/7d2a9e44-6b3f-4c10-b5d8-9e0f1a2b3c4d/thumb';
const TOKEN = 'token-for-test';
const PROJECT: ProjectSummary = {
  id: '0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c',
  title: 'Alpha',
  status: 'finished',
  posted: false,
  coverThumbUrl: COVER_PATH,
  lastEditedAt: '2026-11-03T10:30:00.000Z',
  shelfPosition: 0,
  kind: 'original',
};

function renderCard() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <ShelfCard project={PROJECT} openToLeft={false} onMove={() => {}} />,
      },
    ],
    { initialEntries: ['/'] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function coverState(container: HTMLElement): string | null {
  return container.querySelector('[data-cover]')?.getAttribute('data-cover') ?? null;
}

function coverImage(container: HTMLElement): HTMLImageElement {
  const image = container.querySelector('img');
  if (image === null) throw new Error('표지 사진이 없다');
  return image;
}

/** fetch 가 돌려줄 응답 흉내 */
function respond(ok: boolean, status: number): Response {
  return { ok, status, blob: () => Promise.resolve(new Blob(['x'])) } as Response;
}

describe('ShelfCard 표지 사진(서버 모드)', () => {
  const revoke = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    setSession(TOKEN, 'notice-1');
    // jsdom 에는 blob 주소를 만드는 기능이 없어 흉내로 채운다.
    URL.createObjectURL = vi.fn(() => 'blob:cover-1');
    URL.revokeObjectURL = revoke;
  });

  afterEach(() => {
    clearSession();
    revoke.mockClear();
    vi.restoreAllMocks();
  });

  it('로그인 토큰으로 표지를 받아 그림 요소에 넣고, 다 뜨면 사진 카드로 바꾼다', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(true, 200));
    const { container } = renderCard();
    const image = coverImage(container);

    // 받기 전에는 그림 요소에 주소를 넣지 않는다(토큰 없이 요청이 나가지 않게).
    expect(image.getAttribute('src')).toBeNull();
    await waitFor(() => expect(image.getAttribute('src')).toBe('blob:cover-1'));
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.test${COVER_PATH}`,
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
    );
    expect(coverState(container)).toBe('loading');

    fireEvent.load(image);
    expect(coverState(container)).toBe('shown');
  });

  it('표지를 받지 못하면 사진 없는 면으로 그린다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(false, 404));
    const { container } = renderCard();

    await waitFor(() => expect(coverState(container)).toBe('failed'));
    expect(container.querySelector('img')).toBeNull();
  });

  it('카드가 사라지면 만들어 둔 임시 그림 주소를 지운다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(true, 200));
    const { container, unmount } = renderCard();
    await waitFor(() => expect(coverImage(container).getAttribute('src')).toBe('blob:cover-1'));

    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:cover-1');
  });
});
