import { expect, it } from 'vitest';
import type { Connection } from '@tome/shared';
import { connectionForCard, connectionsForNode, type CanvasRemixOptions } from './remix-model';
import type { ConnectionApplyState } from './connection-apply';
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
};
it('does not show Connections for absent props, another answer or another node', () => {
  expect(connectionsForNode(undefined, 'answer', 'k1')).toEqual([]);
  expect(connectionsForNode(remix, 'other', 'k1')).toEqual([]);
  expect(connectionsForNode(remix, 'answer', 'k2')).toEqual([]);
  expect(connectionsForNode(remix, undefined, undefined)).toEqual([]);
});
it('keeps distinct Connections but filters dismissed, duplicate and malformed entries', () => {
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

const row = (index: number, nodeId: string): Connection => ({
  ...a,
  id: `00000000-0000-4000-8000-00000000010${index}`,
  nodeId,
});

it('attaches at most one Connection per card, choosing among all rows of a grouped card (#229)', () => {
  const rows = [row(1, 's1'), row(2, 's2'), row(3, 's3')];
  const grouped: CanvasRemixOptions = { ...remix, connectionsByAnswer: { answer: rows } };
  // 묶음 첫 줄은 묶음 전체에서 하나만 고른다(위 줄부터)
  expect(connectionForCard(grouped, 'answer', ['s1', 's2', 's3'])).toEqual(rows[0]);
  expect(connectionForCard(grouped, 'answer', ['s2', 's3'])).toEqual(rows[1]);
  // 묶음의 나머지 줄은 표시가 없다
  expect(connectionForCard(grouped, 'answer', [])).toBeUndefined();
  expect(connectionForCard(undefined, 'answer', ['s1'])).toBeUndefined();
  expect(connectionForCard(grouped, undefined, ['s1'])).toBeUndefined();
});

it('skips Connections with nothing to change and those from a previous partner (#229)', () => {
  const rows = [row(1, 's1'), row(2, 's2'), row(3, 's3')];
  const states: Record<string, ConnectionApplyState> = {
    s1: 'no-change',
    s2: 'stale',
    s3: 'ready',
  };
  const options: CanvasRemixOptions = {
    ...remix,
    connectionsByAnswer: { answer: rows },
    applyStateFor: (_answerId, connection) => states[connection.nodeId]!,
  };
  expect(connectionForCard(options, 'answer', ['s1', 's2', 's3'])).toEqual(rows[2]);
  // 묶음 전체가 바꿀 것이 없으면 표시를 붙이지 않는다
  expect(connectionForCard(options, 'answer', ['s1'])).toBeUndefined();
  expect(connectionForCard(options, 'answer', ['s2'])).toBeUndefined();
  // 이미 반영됨(applied)·잠시 쓸 수 없음(unavailable)은 표시를 남긴다
  states.s1 = 'applied';
  expect(connectionForCard(options, 'answer', ['s1'])).toEqual(rows[0]);
  states.s1 = 'unavailable';
  expect(connectionForCard(options, 'answer', ['s1'])).toEqual(rows[0]);
  // 지금 상대 것이 아니면 표시하지 않는다
  expect(
    connectionForCard({ ...options, isCurrent: () => false }, 'answer', ['s3']),
  ).toBeUndefined();
});
