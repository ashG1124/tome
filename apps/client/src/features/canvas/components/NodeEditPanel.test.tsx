import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Node } from '@tome/shared';
import { NodeEditPanel, type NodeEditorLabels } from './NodeEditPanel';

afterEach(cleanup);
const labels: NodeEditorLabels = {
  title: 'Edit',
  weighting: 'Weighting',
  meaning: 'Meaning',
  enabled: 'Include',
  regenerate: 'Regenerate',
  priority: 'Priority',
  moveUp: 'Move up',
  moveDown: 'Move down',
  close: 'Close',
};
const node: Node = {
  id: 'e1',
  kind: 'evidence',
  stage: 'evidence',
  text: 'Evidence sentence',
  enabled: true,
  parentIds: [],
};
function setup(selected: Node, nodes: Node[] = [selected], disabled = false) {
  const onChange = vi.fn();
  const onReorder = vi.fn();
  const onReset = vi.fn();
  render(
    <NodeEditPanel
      node={selected}
      snapshot={{ schemaVersion: 1, subjectTemplate: 'Lamp', nodes }}
      labels={labels}
      onChange={onChange}
      onReorder={onReorder}
      onReset={onReset}
      onClose={vi.fn()}
      disabled={disabled}
    />,
  );
  return { onChange, onReorder, onReset };
}
it('toggles evidence without exposing deletion', () => {
  const { onChange, onReset } = setup(node);
  fireEvent.click(screen.getByRole('switch', { name: 'Include' }));
  expect(onChange).toHaveBeenCalledWith({ ...node, enabled: false });
  expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
  expect(onReset).toHaveBeenCalledWith('e1');
});
it('allows selecting each data type and ordering priorities by keyboard buttons', () => {
  const first = {
    ...node,
    id: 's1',
    kind: 'priority',
    stage: 'research',
    order: 0,
    text: 'First',
  } as Node;
  const second = { ...first, id: 's2', order: 1, text: 'Second' };
  const { onReorder } = setup(first, [first, second]);
  fireEvent.click(screen.getByRole('button', { name: 'Move up: Second' }));
  expect(onReorder).toHaveBeenCalledWith('s2', 's1');
  expect(
    (screen.getByRole('button', { name: 'Move up: First' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  cleanup();
  const type = { ...first, id: 'd1', kind: 'dataType' } as Node;
  const other = { ...type, id: 'd2', text: 'Other' };
  const { onChange } = setup(type, [type, other]);
  fireEvent.click(screen.getByRole('switch', { name: 'Other' }));
  expect(onChange).toHaveBeenCalledWith({ ...other, enabled: false });
});
it('locks all editing controls while applying', () => {
  const { onChange, onReset } = setup(node, [node], true);
  fireEvent.click(screen.getByRole('switch'));
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(onReset).not.toHaveBeenCalled();
});
