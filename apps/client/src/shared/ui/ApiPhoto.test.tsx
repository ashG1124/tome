import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiConfig } from '../api';
import { ApiPhoto } from './ApiPhoto';

const originalConfig = { ...apiConfig };
beforeEach(() => {
  apiConfig.mode = 'fake';
});
afterEach(() => {
  cleanup();
  Object.assign(apiConfig, originalConfig);
  vi.unstubAllGlobals();
});
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

it('주소가 없으면 그림을 받지 않고 대체 그림을 그린다(QueryClient 없이도)', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  render(<ApiPhoto path={null} fallback={<span>M</span>} />);
  expect(screen.getByText('M')).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});

it('주소가 있으면 사진을 그린다', () => {
  const { container } = render(
    <ApiPhoto path="/assets/creators/c1/avatar" className="photo" fallback={<span>M</span>} />,
    { wrapper },
  );
  const image = container.querySelector('img');
  expect(image?.getAttribute('src')).toBe('/assets/creators/c1/avatar');
  expect(image?.getAttribute('alt')).toBe('');
  expect(screen.queryByText('M')).toBeNull();
});

it('서버 사진을 받지 못하면 대체 그림으로 돌아간다', async () => {
  apiConfig.mode = 'live';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  render(<ApiPhoto path="/assets/creators/c1/avatar" fallback={<span>M</span>} />, { wrapper });
  await waitFor(() => expect(screen.getByText('M')).toBeTruthy());
});
