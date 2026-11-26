import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Node } from '@tome/shared';
import type { NodeEditorLabels } from './NodeEditPanel';
import { VerificationPanel } from './VerificationPanel';

afterEach(cleanup);
const labels: NodeEditorLabels = {
  title: 'Edit node',
  weighting: 'Weighting',
  meaning: 'Meaning',
  enabled: 'Include',
  regenerate: 'Regenerate',
  priority: 'Priority',
  moveUp: 'Move up',
  moveDown: 'Move down',
  close: 'Close',
  comment: 'Add a comment',
  delete: 'Delete',
};
const v1: Node = {
  id: 'v1',
  kind: 'criterion',
  stage: 'verify',
  text: 'The image shows a lamp.',
  enabled: true,
  parentIds: [],
};
const v2: Node = { ...v1, id: 'v2', text: 'The image shows a desk.', enabled: false };

function setup(props: Partial<Parameters<typeof VerificationPanel>[0]> = {}) {
  const handlers = { onToggle: vi.fn(), onRestore: vi.fn(), onClose: vi.fn() };
  render(
    <VerificationPanel node={v2} criteria={[v1, v2]} labels={labels} {...handlers} {...props} />,
  );
  return handlers;
}

it('lists the whole criteria group and toggles a criterion with its minus button', () => {
  const { onToggle, onRestore, onClose } = setup();
  const first = screen.getByRole('switch', { name: `Include: ${v1.text}` });
  const second = screen.getByRole('switch', { name: `Include: ${v2.text}` });
  expect(document.activeElement).toBe(first);
  expect(first.getAttribute('aria-checked')).toBe('true');
  expect(second.getAttribute('aria-checked')).toBe('false');
  expect(second.closest('li')?.getAttribute('data-enabled')).toBe('false');
  fireEvent.click(first);
  expect(onToggle).toHaveBeenCalledWith('v1', false);
  fireEvent.click(second);
  expect(onToggle).toHaveBeenCalledWith('v2', true);
  // 노드 도구는 실제로 되는 일만: 코멘트(부모가 줄 때)와 다시 생성(처음 값으로). 삭제는 없다
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
  expect(onRestore).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Add a comment' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  fireEvent.keyDown(first, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});

it('locks every toggle and Escape while saving and shows the error as an alert', () => {
  const { onToggle, onClose } = setup({ saving: ['v1'], errorMessage: 'Something went wrong.' });
  const first = screen.getByRole('switch', { name: `Include: ${v1.text}` });
  expect((first as HTMLButtonElement).disabled).toBe(true);
  expect(first.getAttribute('aria-busy')).toBe('true');
  expect(
    (screen.getByRole('switch', { name: `Include: ${v2.text}` }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect((screen.getByRole('button', { name: 'Regenerate' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(first);
  expect(onToggle).not.toHaveBeenCalled();
  fireEvent.keyDown(first, { key: 'Escape' });
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('Something went wrong.');
});

it('disables regenerate when every criterion already has its initial value', () => {
  setup({ onRestore: undefined });
  expect((screen.getByRole('button', { name: 'Regenerate' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});

it('shows a discrepancy as centred text only, with no actions', () => {
  const mismatch: Node = { ...v1, id: 'm1', kind: 'mismatch', text: 'A forest in the city' };
  const { onClose } = setup({ node: mismatch, criteria: [] });
  const region = screen.getByRole('region', { name: `Edit node: ${mismatch.text}` });
  expect(document.activeElement).toBe(region);
  expect(region.getAttribute('data-kind')).toBe('mismatch');
  expect(screen.getByText(mismatch.text).classList.contains('node-open-title')).toBe(true);
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
  fireEvent.keyDown(region, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});

it('offers the comment button on the criteria group when the parent allows it (#241)', () => {
  const onComment = vi.fn();
  setup({ onComment });
  const buttons = screen.getAllByRole('button');
  expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
    'Add a comment',
    'Regenerate',
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Add a comment' }));
  expect(onComment).toHaveBeenCalledOnce();
});

it('discrepancies stay view-only: no node tool even with a comment handler', () => {
  setup({
    node: { ...v1, id: 'm1', kind: 'mismatch', text: 'No desk.' },
    criteria: [],
    onComment: vi.fn(),
  });
  expect(screen.queryByRole('button')).toBeNull();
});

it('clicking the open criteria group again closes it; the minus buttons and saving do not (#261)', () => {
  const { onClose, onToggle } = setup();
  fireEvent.click(screen.getByRole('switch', { name: `Include: ${v1.text}` }));
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
  expect(onToggle).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText(v1.text));
  expect(onClose).toHaveBeenCalledOnce();
  cleanup();
  const saving = setup({ saving: ['v1'] });
  fireEvent.click(screen.getByText(v1.text));
  expect(saving.onClose).not.toHaveBeenCalled();
});
