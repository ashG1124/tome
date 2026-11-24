import { describe, expect, it } from 'vitest';
import type { Node, NodeSnapshot } from '@tome/shared';
import { applyConnection, connectionApplyState, isApplicableAction } from './connection-apply';

const node = (partial: Partial<Node> & Pick<Node, 'id' | 'kind'>): Node => ({
  stage: 'analyze',
  text: partial.id,
  enabled: true,
  parentIds: [],
  ...partial,
});

const snapshot = (nodes: Node[]): NodeSnapshot => ({
  schemaVersion: 1,
  subjectTemplate: 'A lamp',
  nodes,
});

const keyword = (weight: number, ai = weight) =>
  node({ id: 'k1', kind: 'keyword', weight, aiInitial: { weight: ai } });
const evidence = (enabled: boolean, ai = enabled) =>
  node({ id: 'e1', kind: 'evidence', stage: 'evidence', enabled, aiInitial: { enabled: ai } });
const priorities = (orders: number[], ai = orders) =>
  orders.map((order, index) =>
    node({
      id: `s${index + 1}`,
      kind: 'priority',
      stage: 'research',
      order,
      aiInitial: { order: ai[index] },
    }),
  );

const weightAfter = (action: string, weight: number, ai = weight) =>
  applyConnection(snapshot([keyword(weight, ai)]), { nodeId: 'k1', predictedAction: action })
    ?.nodes[0]?.weight ?? null;
const enabledAfter = (action: string, enabled: boolean, ai = enabled) =>
  applyConnection(snapshot([evidence(enabled, ai)]), { nodeId: 'e1', predictedAction: action })
    ?.nodes[0]?.enabled ?? null;
/** 우선순위를 순서대로 늘어놓은 id. 바뀌지 않으면 null */
const orderAfter = (action: string, id: string, orders: number[], ai = orders) => {
  const next = applyConnection(snapshot(priorities(orders, ai)), {
    nodeId: id,
    predictedAction: action,
  });
  return next === null
    ? null
    : [...next.nodes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((entry) => entry.id);
};

describe('applyConnection — 가중치 노드(keyword·attribute)', () => {
  it('Lean on evidence 는 2 내리고, Trust intuition 은 2 올린다(끝에서 멈춘다)', () => {
    expect(weightAfter('Lean on evidence', 5)).toBe(3);
    expect(weightAfter('Lean on evidence', 1)).toBe(0);
    expect(weightAfter('Lean on evidence', 0)).toBeNull();
    expect(weightAfter('Trust intuition', 5)).toBe(7);
    expect(weightAfter('Trust intuition', 8)).toBe(9);
    expect(weightAfter('Trust intuition', 9)).toBeNull();
  });

  it('Make a bold change 는 AI 값에서 먼 끝으로 간다', () => {
    expect(weightAfter('Make a bold change', 5, 4)).toBe(9);
    expect(weightAfter('Make a bold change', 5, 5)).toBe(0);
    expect(weightAfter('Make a bold change', 9, 2)).toBeNull();
  });

  it('Take the lead 는 2 올리고, 넘치면 2 내린다', () => {
    expect(weightAfter('Take the lead', 5)).toBe(7);
    expect(weightAfter('Take the lead', 8)).toBe(6);
  });

  it('Keep the change small·Let the AI lead 는 AI 처음 값으로 되돌리고, 이미 같으면 바꿀 것이 없다', () => {
    expect(weightAfter('Keep the change small', 9, 4)).toBe(4);
    expect(weightAfter('Let the AI lead', 1, 6)).toBe(6);
    expect(weightAfter('Keep the change small', 5)).toBeNull();
    expect(weightAfter('Let the AI lead', 5)).toBeNull();
  });

  it('attribute 노드도 같은 규칙이다', () => {
    const next = applyConnection(
      snapshot([node({ id: 'a1', kind: 'attribute', stage: 'draft', weight: 5 })]),
      { nodeId: 'a1', predictedAction: 'Take the lead' },
    );
    expect(next?.nodes[0]?.weight).toBe(7);
  });
});

describe('applyConnection — 켜고 끄는 노드(dataType·evidence)', () => {
  it('Lean on evidence 는 켜고, Trust intuition 은 끈다', () => {
    expect(enabledAfter('Lean on evidence', false)).toBe(true);
    expect(enabledAfter('Lean on evidence', true)).toBeNull();
    expect(enabledAfter('Trust intuition', true)).toBe(false);
  });

  it('Make a bold change·Take the lead 는 반대로, 되돌리기는 AI 처음 값으로', () => {
    expect(enabledAfter('Make a bold change', true)).toBe(false);
    expect(enabledAfter('Take the lead', false)).toBe(true);
    expect(enabledAfter('Let the AI lead', false, true)).toBe(true);
    expect(enabledAfter('Keep the change small', true, true)).toBeNull();
  });
});

describe('applyConnection — 우선순위(priority)', () => {
  it('Lean on evidence 는 한 칸 위로, Trust intuition 은 한 칸 아래로', () => {
    expect(orderAfter('Lean on evidence', 's2', [0, 1, 2])).toEqual(['s2', 's1', 's3']);
    expect(orderAfter('Lean on evidence', 's1', [0, 1, 2])).toBeNull();
    expect(orderAfter('Trust intuition', 's2', [0, 1, 2])).toEqual(['s1', 's3', 's2']);
  });

  it('Make a bold change 는 먼 끝으로, Take the lead 는 한 칸 위로(맨 위면 아래로)', () => {
    expect(orderAfter('Make a bold change', 's1', [0, 1, 2, 3])).toEqual(['s2', 's3', 's4', 's1']);
    expect(orderAfter('Make a bold change', 's4', [0, 1, 2, 3])).toEqual(['s4', 's1', 's2', 's3']);
    expect(orderAfter('Take the lead', 's1', [0, 1, 2])).toEqual(['s2', 's1', 's3']);
  });

  it('되돌리기는 AI 처음 순서로 옮기고, 이미 그 자리면 바꿀 것이 없다', () => {
    expect(orderAfter('Let the AI lead', 's1', [2, 0, 1], [0, 1, 2])).toEqual(['s1', 's2', 's3']);
    expect(orderAfter('Keep the change small', 's2', [0, 1, 2])).toBeNull();
  });
});

describe('applyConnection — 쓸 수 없는 경우', () => {
  it('모르는 행동·없는 노드·고칠 수 없는 노드는 null', () => {
    expect(weightAfter('Do something else', 5)).toBeNull();
    expect(
      applyConnection(snapshot([keyword(5)]), { nodeId: 'k9', predictedAction: 'Take the lead' }),
    ).toBeNull();
    expect(
      applyConnection(snapshot([node({ id: 'v1', kind: 'criterion', stage: 'verify' })]), {
        nodeId: 'v1',
        predictedAction: 'Take the lead',
      }),
    ).toBeNull();
    expect(isApplicableAction('Lean on evidence')).toBe(true);
    expect(isApplicableAction('toString')).toBe(false);
  });

  it('상태: 반영됨 → 예전 상대 → 쓸 수 없음 → 바꿀 것 없음 → 누를 수 있음 순서로 정한다', () => {
    const base = {
      connection: { nodeId: 'k1', predictedAction: 'Trust intuition', status: 'shown' as const },
      current: true,
      appliedNow: false,
      editable: true,
      snapshot: snapshot([keyword(5)]),
    };
    expect(connectionApplyState(base)).toBe('ready');
    expect(
      connectionApplyState({ ...base, connection: { ...base.connection, status: 'applied' } }),
    ).toBe('applied');
    expect(connectionApplyState({ ...base, appliedNow: true, current: false })).toBe('applied');
    expect(connectionApplyState({ ...base, current: false })).toBe('stale');
    expect(connectionApplyState({ ...base, editable: false })).toBe('unavailable');
    expect(connectionApplyState({ ...base, snapshot: undefined })).toBe('unavailable');
    expect(
      connectionApplyState({
        ...base,
        connection: { ...base.connection, predictedAction: 'Unknown' },
      }),
    ).toBe('unavailable');
    expect(connectionApplyState({ ...base, snapshot: snapshot([keyword(9)]) })).toBe('no-change');
  });

  it('다른 노드는 건드리지 않는다', () => {
    const before = snapshot([keyword(5), evidence(true)]);
    const next = applyConnection(before, { nodeId: 'k1', predictedAction: 'Trust intuition' });
    expect(next?.nodes[1]).toEqual(before.nodes[1]);
    expect(before.nodes[0]?.weight).toBe(5);
  });
});
