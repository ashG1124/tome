import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '../model';
import { closedBox, openShifts, openTargets } from './useOpenShift';

/** 단계 열 하나에 위에서 아래로 놓인 노드. 높이는 heights 에 따로 둔다. */
function card(
  id: string,
  y: number,
  extra: { kind?: string; groupPosition?: string; column?: number; setId?: string } = {},
): CanvasNode {
  return {
    id,
    position: { x: 0, y },
    data: {
      setId: extra.setId ?? 's1',
      column: extra.column ?? 1,
      output: { id, kind: extra.kind ?? 'keyword' },
      groupPosition: extra.groupPosition ?? 'only',
    },
  } as unknown as CanvasNode;
}
const heightsOf = (heights: Record<string, number>) => (id: string) => heights[id] ?? 0;
/** 밀어낸 양(shifts)이 바뀐 만큼 노드를 옮긴다(훅이 하는 일과 같다). */
const moved = (
  nodes: readonly CanvasNode[],
  shifts: ReadonlyMap<string, number>,
  applied: ReadonlyMap<string, number> = new Map(),
) =>
  nodes.map((node) => ({
    ...node,
    position: {
      x: node.position.x,
      y: node.position.y + (shifts.get(node.id) ?? 0) - (applied.get(node.id) ?? 0),
    },
  })) as CanvasNode[];

describe('openShifts — 펼친 노드 아래를 밀어 내리기(#261)', () => {
  const closed = { k1: 40, k2: 40, k3: 40 };
  const column = [card('k1', 0), card('k2', 50), card('k3', 100)];
  const other = [card('d1', 0, { column: 2 }), card('x1', 100, { setId: 's2' })];
  const nodes = [...column, ...other];

  it('펼친 노드의 아래 노드만 늘어난 높이만큼 민다(다른 열·다른 세트·위 노드는 그대로)', () => {
    const box = closedBox(column[1]!, [], heightsOf(closed));
    expect(box).toMatchObject({ anchor: 'k2', setId: 's1', column: 1, extent: 40 });
    const shifts = openShifts(nodes, [box], heightsOf({ ...closed, k2: 240 }), new Map());
    expect([...shifts]).toEqual([['k3', 200]]);
  });

  it('펼치는 동안 높이가 조금씩 늘면 그때그때 그만큼만 민다', () => {
    const box = closedBox(column[0]!, [], heightsOf(closed));
    const first = openShifts(nodes, [box], heightsOf({ ...closed, k1: 100 }), new Map());
    expect([...first]).toEqual([
      ['k2', 60],
      ['k3', 60],
    ]);
    // 이미 60 밀린 자리에서 다시 재도, 밀기 전 자리로 견주므로 아래 노드를 놓치지 않는다.
    const second = openShifts(moved(nodes, first), [box], heightsOf({ ...closed, k1: 200 }), first);
    expect([...second]).toEqual([
      ['k2', 160],
      ['k3', 160],
    ]);
  });

  it('펼친 노드 바로 아래 노드를 이어서 펼쳐도 그 아래 노드가 밀린다(겹치지 않는다)', () => {
    const first = closedBox(column[0]!, [], heightsOf(closed));
    const applied = openShifts(nodes, [first], heightsOf({ ...closed, k1: 200 }), new Map());
    const shifted = moved(nodes, applied);
    // k2 는 이미 160 내려와 있다. 닫힌 자리는 밀린 위치와 상관없이 높이로만 잰다.
    const second = closedBox(shifted[1]!, [], heightsOf({ ...closed, k1: 200 }));
    expect(second.extent).toBe(40);
    const both = openShifts(
      shifted,
      [first, second],
      heightsOf({ ...closed, k1: 200, k2: 300 }),
      applied,
    );
    expect([...both]).toEqual([
      ['k2', 160],
      ['k3', 160 + 260],
    ]);
    const placed = moved(shifted, both, applied);
    const y = (id: string) => placed.find((node) => node.id === id)!.position.y;
    // k1 아래끝 ≤ k2 위끝, k2 아래끝 ≤ k3 위끝
    expect(y('k1') + 200).toBeLessThanOrEqual(y('k2'));
    expect(y('k2') + 300).toBeLessThanOrEqual(y('k3'));
  });

  it('위 노드를 접고 아래 노드를 펼치는 일이 한 번에 와도, 아직 밀려 있는 위치에 속지 않는다', () => {
    const first = closedBox(column[0]!, [], heightsOf(closed));
    const applied = openShifts(nodes, [first], heightsOf({ ...closed, k1: 200 }), new Map());
    const shifted = moved(nodes, applied);
    const second = closedBox(shifted[1]!, [], heightsOf({ ...closed, k1: 200 }));
    // k1 은 접혔고(자리 버림) k2 만 펼쳐져 있다. 위치는 아직 k1 이 밀어 둔 그대로다.
    const next = openShifts(shifted, [second], heightsOf({ ...closed, k2: 300 }), applied);
    expect([...next]).toEqual([['k3', 260]]);
    const placed = moved(shifted, next, applied);
    const y = (id: string) => placed.find((node) => node.id === id)!.position.y;
    // k2 는 제자리(50)로 돌아가고 k3 는 k2 의 펼친 아래끝보다 아래에 있다.
    expect(y('k2')).toBe(50);
    expect(y('k2') + 300).toBeLessThanOrEqual(y('k3'));
  });

  it('접으면(자리가 없으면) 밀 것이 없다', () => {
    expect(openShifts(nodes, [], heightsOf(closed), new Map([['k3', 200]])).size).toBe(0);
  });

  it('묶음(우선순위)은 첫 줄에서 펼쳐져 나머지 줄을 덮고, 묶음 아래 노드만 민다', () => {
    const group = [
      card('p1', 0, { kind: 'priority', groupPosition: 'first' }),
      card('p2', 35, { kind: 'priority', groupPosition: 'middle' }),
      card('p3', 70, { kind: 'priority', groupPosition: 'last' }),
      card('t1', 110, { kind: 'dataType' }),
    ];
    const heights = { p1: 30, p2: 30, p3: 30, t1: 30 };
    const { anchor, covered } = openTargets(group, { setId: 's1', nodeId: 'p2', kind: 'priority' });
    expect(anchor?.id).toBe('p1');
    expect(covered.map((node) => node.id)).toEqual(['p2', 'p3']);
    const box = closedBox(anchor!, covered, heightsOf(heights));
    expect(box.extent).toBe(100);
    const shifts = openShifts(group, [box], heightsOf({ ...heights, p1: 250 }), new Map());
    expect([...shifts]).toEqual([['t1', 150]]);
  });
});
