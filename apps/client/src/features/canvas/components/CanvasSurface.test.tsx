import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CANVAS_COPY } from '../../../shared/copy';
import { useApiImage } from '../../../shared/api';
import type { Answer } from '@tome/shared';
import { CanvasSurface } from './CanvasSurface';

vi.mock('../../../shared/api', () => ({ useApiImage: vi.fn() }));
afterEach(() => vi.clearAllMocks());

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

it('delegates protected image loading to the common hook with the image ref', () => {
  const path = '/assets/answers/test/full';
  render(<CanvasSurface data={card(path)} />);
  const image = screen.getByRole('img', { name: 'Answer 01' });
  expect(useApiImage).toHaveBeenCalledWith(path, expect.objectContaining({ current: image }));
  expect(image.getAttribute('src')).toBeNull();
});

it('passes a replaced answer path to the common hook', () => {
  const { rerender } = render(<CanvasSurface data={card('/assets/answers/first/full')} />);
  rerender(<CanvasSurface data={card('/assets/answers/second/full')} />);
  expect(useApiImage).toHaveBeenLastCalledWith(
    '/assets/answers/second/full',
    expect.objectContaining({
      current: screen.getByRole('img', { name: 'Answer 01' }),
    }),
  );
});

it('shows the sample badge and explanation without requiring a tooltip', () => {
  render(<CanvasSurface data={card('/assets/answers/sample/full', true)} />);
  expect(screen.getByText(CANVAS_COPY.sample)).toBeTruthy();
  expect(screen.getByText(CANVAS_COPY.sampleDescription).getAttribute('title')).toBeNull();
});

it('does not label a generated answer as a sample', () => {
  render(<CanvasSurface data={card('/assets/answers/generated/full')} />);
  expect(screen.queryByText(CANVAS_COPY.sample)).toBeNull();
  expect(screen.queryByText(CANVAS_COPY.sampleDescription)).toBeNull();
});
