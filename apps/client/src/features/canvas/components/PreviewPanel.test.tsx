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

it('collapses the image while keeping status and Apply available', () => {
  render(<PreviewPanel {...props} generating={false} statusLabel="Ready" />);
  const toggle = screen.getByRole('button', { name: props.title });
  const image = document.getElementById(toggle.getAttribute('aria-controls')!);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(toggle);
  expect(image?.hidden).toBe(true);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.getByRole('button', { name: props.applyLabel })).toBeTruthy();
  expect(screen.getByText('Ready')).toBeTruthy();
  fireEvent.click(toggle);
  expect(image?.hidden).toBe(false);
});
