import { expect, it } from 'vitest';
import type { Connection } from '@tome/shared';
import { connectionsForNode, type CanvasRemixOptions } from './remix-model';
const a: Connection = {
  id: '00000000-0000-4000-8000-000000000001',
  nodeId: 'k1',
  predictedAction: 'Lean on evidence',
  sentence: 'Leaned on evidence 7 of 10 times',
  status: 'shown',
};
const remix: CanvasRemixOptions = {
  connectionsByAnswer: { answer: [a] },
  onApply: async () => {},
  onDismiss: async () => {},
};
it('does not show Connections for absent props, another answer or another node', () => {
  expect(connectionsForNode(undefined, 'answer', 'k1')).toEqual([]);
  expect(connectionsForNode(remix, 'other', 'k1')).toEqual([]);
  expect(connectionsForNode(remix, 'answer', 'k2')).toEqual([]);
  expect(connectionsForNode(remix, undefined, undefined)).toEqual([]);
});
it('keeps distinct retained Connections but filters dismissed, duplicate and malformed entries', () => {
  const previous = {
    ...a,
    id: '00000000-0000-4000-8000-000000000002',
    sentence: 'Made bold changes 4 of 6 times',
    status: 'applied' as const,
  };
  expect(
    connectionsForNode(
      {
        ...remix,
        connectionsByAnswer: {
          answer: [a, a, previous, { ...a, status: 'dismissed' }, { ...a, id: 'broken' }],
        },
      },
      'answer',
      'k1',
    ),
  ).toEqual([a, previous]);
});
