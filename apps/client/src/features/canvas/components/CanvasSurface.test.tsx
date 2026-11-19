import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CANVAS_COPY, COPY } from '../../../shared/copy';
import { apiConfig } from '../../../shared/api';
import type { Answer } from '@tome/shared';
import type { ReactNode } from 'react';
import { CanvasSurface } from './CanvasSurface';

const originalConfig = { ...apiConfig };
const clients: QueryClient[] = [];
beforeEach(() => {
  apiConfig.mode = 'fake';
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  Object.assign(apiConfig, originalConfig);
  vi.unstubAllGlobals();
});
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function card(imageUrl: string, isSample = false) {
  return {
    kind: 'answer' as const,
    setId: 'set',
    column: 6,
    row: 0,
    label: 'Answer 01',
    labels: CANVAS_COPY,
    state: 'done' as const,
    answer: { imageUrl, isSample } as Answer,
  };
}
it('sets img src in fake mode using the real useApiImage hook without fetching', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const path = '/assets/answers/test/full';
  render(<CanvasSurface data={card(path)} />, { wrapper });
  expect(screen.getByRole('img', { name: 'Answer 01' }).getAttribute('src')).toBe(path);
  expect(fetch).not.toHaveBeenCalled();
});
it('uses complete image addresses directly in live mode', () => {
  apiConfig.mode = 'live';
  const url = 'https://example.test/answer.png';
  render(<CanvasSurface data={card(url)} />, { wrapper });
  expect(screen.getByRole('img').getAttribute('src')).toBe(url);
});
it('updates direct src when an answer image changes', () => {
  const { rerender } = render(<CanvasSurface data={card('/first.png')} />, { wrapper });
  rerender(<CanvasSurface data={card('/second.png')} />);
  expect(screen.getByRole('img').getAttribute('src')).toBe('/second.png');
});
it('announces protected image fetch failures and retains the mounted image ref', async () => {
  apiConfig.mode = 'live';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
  const { container } = render(<CanvasSurface data={card('/assets/answers/test/full')} />, {
    wrapper,
  });
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe(COPY['E-01a']));
  expect(container.querySelector('img')?.hidden).toBe(true);
});
it('shows a fallback for broken direct images and clears it when the answer changes', () => {
  const { rerender } = render(<CanvasSurface data={card('/broken.png')} />, { wrapper });
  fireEvent.error(screen.getByRole('img'));
  expect(screen.getByRole('status').textContent).toBe(COPY['E-01a']);
  rerender(<CanvasSurface data={card('/working.png')} />);
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByRole('img').getAttribute('src')).toBe('/working.png');
});
it('shows the sample badge and explanation without requiring a tooltip', () => {
  render(<CanvasSurface data={card('/sample.png', true)} />, { wrapper });
  expect(screen.getByText(CANVAS_COPY.sample)).toBeTruthy();
  expect(screen.getByText(CANVAS_COPY.sampleDescription).getAttribute('title')).toBeNull();
});
it('does not label a generated answer as a sample', () => {
  render(<CanvasSurface data={card('/generated.png')} />, { wrapper });
  expect(screen.queryByText(CANVAS_COPY.sample)).toBeNull();
  expect(screen.queryByText(CANVAS_COPY.sampleDescription)).toBeNull();
});
