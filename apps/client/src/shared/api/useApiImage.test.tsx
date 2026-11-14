import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiConfig } from './config';
import { useApiImage } from './useApiImage';

const PATH = '/assets/answers/7d2a9e44-6b3f-4c10-b5d8-9e0f1a2b3c4d/thumb';

function Picture({ path }: { path: string | null }) {
  const ref = useRef<HTMLImageElement>(null);
  const { directSrc, failed } = useApiImage(path, ref);
  return <img ref={ref} src={directSrc} alt="" data-failed={String(failed)} />;
}

function renderPicture(path: string | null) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <Picture path={path} />
    </QueryClientProvider>,
  );
}

describe('useApiImage', () => {
  const original = { ...apiConfig };
  const { createObjectURL, revokeObjectURL } = URL;

  afterEach(() => {
    Object.assign(apiConfig, original);
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    vi.restoreAllMocks();
  });

  it('가짜 응답 모드에서는 주소를 그대로 쓰고 따로 받지 않는다', () => {
    Object.assign(apiConfig, { mode: 'fake' });
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { container } = renderPicture(PATH);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(PATH);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('서버 모드에서는 받아 온 그림을 임시 주소로 넣고, 사라지면 해제한다', async () => {
    Object.assign(apiConfig, { mode: 'live', baseUrl: 'https://api.example.test' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob(['x'])),
    } as Response);
    const create = vi.fn(() => 'blob:picture-1');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });

    const { container, unmount } = renderPicture(PATH);
    await waitFor(() =>
      expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:picture-1'),
    );
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:picture-1');
  });

  it('받지 못하면 failed 를 알린다', async () => {
    Object.assign(apiConfig, { mode: 'live', baseUrl: 'https://api.example.test' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404 } as Response);
    const { container } = renderPicture(PATH);
    await waitFor(() =>
      expect(container.querySelector('img')?.getAttribute('data-failed')).toBe('true'),
    );
  });
});
