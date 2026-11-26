import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CANVAS_COPY, COPY } from '../../../shared/copy';
import { apiConfig } from '../../../shared/api';
import type { Answer, WorkspaceDerivedFrom } from '@tome/shared';
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
it('draws the prompt node with its label and mark inside the card (#228, 1192:65515)', () => {
  render(
    <CanvasSurface
      data={{
        kind: 'prompt',
        setId: 'set',
        column: 0,
        row: 0,
        label: CANVAS_COPY.prompt,
        labels: CANVAS_COPY,
        state: 'done',
        text: 'A lamp on a desk',
      }}
    />,
    { wrapper },
  );
  const node = screen.getByRole('article', { name: CANVAS_COPY.prompt });
  expect(node.className).toContain('canvas-card--prompt');
  const head = node.querySelector('.canvas-prompt-head')!;
  expect(head.getAttribute('aria-hidden')).toBe('true');
  expect(head.textContent).toBe(CANVAS_COPY.prompt);
  expect(head.querySelector('[data-icon="sparkle"]')).not.toBeNull();
  expect(node.querySelector('.canvas-prompt-text')?.textContent).toBe('A lamp on a desk');
});
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

function origin(extra: Partial<WorkspaceDerivedFrom>, label = 'Answer 06') {
  return {
    kind: 'origin' as const,
    setId: 'set',
    column: 6,
    row: 0,
    label,
    labels: CANVAS_COPY,
    state: 'done' as const,
    origin: {
      projectId: 'origin',
      title: 'City sneakers',
      creator: { id: 'c', kind: 'seed', displayName: 'shina', bio: null, avatarUrl: null },
      answer: { id: 'o', number: 6, imageUrl: '/origin.png', thumbUrl: '/origin-thumb.png' },
      ...extra,
    } as WorkspaceDerivedFrom,
  };
}
it('draws the original answer read-only with its number chip, veiled only while inactive (#229)', () => {
  const { container, rerender } = render(<CanvasSurface data={origin({})} />, { wrapper });
  expect(screen.getByRole('img', { name: 'Answer 06' }).getAttribute('src')).toBe('/origin.png');
  expect(container.querySelector('.canvas-answer-chip')?.textContent).toBe('Answer 06');
  // 파생 직후처럼 원작이 활성이면 흐림이 없다
  expect(container.querySelector('.canvas-origin-veil')).toBeNull();
  expect(container.querySelector('article')?.getAttribute('data-readonly')).toBe('true');
  expect(container.querySelector('article')?.hasAttribute('data-inactive')).toBe(false);
  expect(screen.queryByRole('button')).toBeNull();
  rerender(<CanvasSurface data={{ ...origin({}), inactive: true }} />);
  expect(container.querySelector('.canvas-origin-veil')).not.toBeNull();
  expect(container.querySelector('article')?.getAttribute('data-inactive')).toBe('true');
});
it('draws an inactive My answer from its summary with a chip and veil (#229)', () => {
  const summary = {
    id: 'mine',
    number: 2,
    pinned: false,
    isSample: false,
    thumbUrl: '/mine-thumb.png',
    createdAt: '2026-11-25T00:00:00.000Z',
  };
  const base = {
    kind: 'answer' as const,
    setId: 'set',
    column: 6,
    row: 1,
    label: 'Answer 02',
    labels: CANVAS_COPY,
    state: 'done' as const,
  };
  const { container } = render(<CanvasSurface data={{ ...base, summary, inactive: true }} />, {
    wrapper,
  });
  expect(screen.getByRole('img', { name: 'Answer 02' }).getAttribute('src')).toBe(
    '/mine-thumb.png',
  );
  expect(container.querySelector('.canvas-answer-chip')?.textContent).toBe('Answer 02');
  expect(container.querySelector('.canvas-origin-veil')).not.toBeNull();
  expect(container.querySelector('.canvas-answer-footer')).toBeNull();
});
it('shows Deleted original when the original is gone', () => {
  render(
    <CanvasSurface data={origin({ title: null, creator: null, answer: null }, COPY['S-06'])} />,
    { wrapper },
  );
  expect(screen.getByRole('status').textContent).toBe('Deleted original');
});
it('leaves an empty slot without a chip when only the original answer is gone', () => {
  const { container } = render(
    <CanvasSurface data={origin({ answer: null }, 'shina’s answer')} />,
    {
      wrapper,
    },
  );
  expect(container.querySelector('.canvas-origin-slot')?.getAttribute('data-empty')).toBe('true');
  expect(container.querySelector('.canvas-answer-chip')).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
});
it('shows an unapplied off value on the closed node (struck-through priority, off evidence switch)', () => {
  const output = (kind: 'priority' | 'evidence') => ({
    kind: 'output' as const,
    setId: 'set',
    column: kind === 'priority' ? 2 : 3,
    row: 0,
    label: 'Light over form',
    text: 'Light over form',
    labels: CANVAS_COPY,
    state: 'done' as const,
    output: {
      id: kind,
      stage: kind === 'priority' ? ('research' as const) : ('evidence' as const),
      kind,
      text: 'Light over form',
      enabled: true,
      parentIds: [],
    },
  });
  const { container, rerender } = render(
    <CanvasSurface data={output('priority')} enabled={false} />,
    {
      wrapper,
    },
  );
  expect(container.querySelector('article')?.getAttribute('data-enabled')).toBe('false');
  rerender(<CanvasSurface data={output('evidence')} enabled={false} />);
  expect(container.querySelector('.canvas-node-switch')?.getAttribute('data-on')).toBe('false');
  rerender(<CanvasSurface data={output('evidence')} />);
  expect(container.querySelector('.canvas-node-switch')?.getAttribute('data-on')).toBe('true');
});
it('does not show Model knowledge or Not measured under step 3 / step 5 nodes (#230)', () => {
  const base = { setId: 'set', row: 0, labels: CANVAS_COPY, kind: 'output' as const };
  render(
    <>
      <CanvasSurface
        data={{
          ...base,
          column: 3,
          label: 'Brass base',
          text: 'Brass base',
          state: 'done',
          output: {
            id: 'e1',
            kind: 'evidence',
            stage: 'evidence',
            text: 'Brass base',
            enabled: true,
            parentIds: [],
            sourceType: 'model_knowledge',
          },
        }}
      />
      <CanvasSurface
        data={{
          ...base,
          column: 5,
          label: 'Shows brass',
          text: 'Shows brass',
          state: 'skipped',
          groupPosition: 'only',
          output: {
            id: 'v1',
            kind: 'criterion',
            stage: 'verify',
            text: 'Shows brass',
            enabled: true,
            parentIds: [],
          },
        }}
      />
    </>,
    { wrapper },
  );
  expect(screen.getByText('Brass base')).toBeTruthy();
  expect(screen.queryByText(CANVAS_COPY.modelKnowledge)).toBeNull();
  expect(screen.queryByText(CANVAS_COPY.skipped)).toBeNull();
  expect(document.querySelector('.canvas-card small')).toBeNull();
});
