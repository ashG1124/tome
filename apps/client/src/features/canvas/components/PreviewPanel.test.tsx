import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Answer } from '@tome/shared';
import { PreviewPanel, type PreviewPanelProps } from './PreviewPanel';

afterEach(cleanup);
const props: PreviewPanelProps = {
  title: 'Preview',
  applyLabel: 'Apply the fix',
  statusLabel: 'Generating',
  generating: true,
  applying: false,
  canApply: true,
  stacked: false,
  open: true,
  answer: { id: 'base' } as Answer,
  renderImage: () => <img alt="Base answer" />,
  onApply: vi.fn().mockResolvedValue(undefined),
};
it('keeps the base image with a gradient and disables Apply while generating', () => {
  const { container, rerender } = render(<PreviewPanel {...props} />);
  expect(container.querySelector('.canvas-gradient')).not.toBeNull();
  expect(screen.getByRole('img', { name: 'Base answer' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: props.applyLabel }));
  expect(props.onApply).not.toHaveBeenCalled();
  rerender(<PreviewPanel {...props} generating={false} statusLabel="Ready" />);
  fireEvent.click(screen.getByRole('button', { name: props.applyLabel }));
  expect(props.onApply).toHaveBeenCalledOnce();
});
it('announces failures and successful stacking', () => {
  render(
    <PreviewPanel {...props} generating={false} canApply={false} errorMessage="Failed" stacked />,
  );
  expect(screen.getByRole('alert').textContent).toBe('Failed');
  expect(screen.getByText('This version will be updated as the accepted answer')).toBeTruthy();
});

it('starts closed as a small pill and opens with the toggle', () => {
  const { container } = render(
    <PreviewPanel {...props} open={undefined} generating={false} statusLabel="" />,
  );
  const toggle = screen.getByRole('button', { name: props.title });
  const image = document.getElementById(toggle.getAttribute('aria-controls')!);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(image?.hidden).toBe(true);
  expect(screen.queryByRole('button', { name: props.applyLabel })).toBeNull();
  expect(container.querySelector('[data-status="default"]')).not.toBeNull();
  fireEvent.click(toggle);
  expect(image?.hidden).toBe(false);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('button', { name: props.applyLabel })).toBeTruthy();
});

it('draws no image and no dot while there is no preview', () => {
  const { container } = render(
    <PreviewPanel {...props} generating={false} answer={undefined} statusLabel="" />,
  );
  expect(screen.queryByRole('img')).toBeNull();
  expect(container.querySelector('.node-preview-dot')).toBeNull();
});

it('marks a finished preview with a dot and collapses with Escape, keeping the status', () => {
  const onOpenChange = vi.fn();
  const { container } = render(
    <PreviewPanel
      {...props}
      generating={false}
      hasPreview
      statusLabel="Ready"
      onOpenChange={onOpenChange}
    />,
  );
  expect(container.querySelector('[data-status="done"] .node-preview-dot')).not.toBeNull();
  expect(container.querySelector('.node-preview-status')?.textContent).toBe('Ready');
  const apply = screen.getByRole('button', { name: props.applyLabel });
  fireEvent.keyDown(apply, { key: 'Escape' });
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('shows previous/next only when there are several previews', () => {
  const onNext = vi.fn();
  const navigation = {
    index: 0,
    count: 1,
    previous: 'Previous preview',
    next: 'Next preview',
    onPrevious: vi.fn(),
    onNext,
  };
  const { rerender } = render(
    <PreviewPanel {...props} generating={false} hasPreview navigation={navigation} />,
  );
  expect(screen.queryByRole('button', { name: 'Next preview' })).toBeNull();
  rerender(
    <PreviewPanel
      {...props}
      generating={false}
      hasPreview
      navigation={{ ...navigation, count: 2 }}
    />,
  );
  expect(
    (screen.getByRole('button', { name: 'Previous preview' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Next preview' }));
  expect(onNext).toHaveBeenCalledOnce();
});
