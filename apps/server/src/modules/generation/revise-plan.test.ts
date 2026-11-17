import type { Node, NodeSnapshot } from '@tome/shared';
import { describe, expect, it } from 'vitest';
import { planRevision } from './revise-plan';

const axes = { xAxis: ['Textured', 'Smooth'], yAxis: ['Horizon', 'Surrounding'] } as const;

const base = (): NodeSnapshot => ({
  schemaVersion: 1,
  subjectTemplate: '{k1} over {k2}',
  nodes: [
    {
      id: 'k1',
      stage: 'analyze',
      kind: 'keyword',
      text: 'lighthouse',
      enabled: true,
      weight: 7,
      pad: { x: 0, y: 0, xAxis: [...axes.xAxis], yAxis: [...axes.yAxis] },
      parentIds: [],
      aiInitial: { weight: 7, pad: { x: 0, y: 0 }, enabled: true },
    },
    {
      id: 'd1',
      stage: 'research',
      kind: 'dataType',
      text: 'Coastal photography',
      enabled: true,
      parentIds: ['k1'],
    },
    {
      id: 's1',
      stage: 'research',
      kind: 'priority',
      text: 'Light over form',
      enabled: true,
      order: 0,
      parentIds: ['d1'],
    },
    {
      id: 'e1',
      stage: 'evidence',
      kind: 'evidence',
      text: 'Dusk shots show the beam.',
      enabled: true,
      parentIds: ['s1'],
    },
    {
      id: 'a1',
      stage: 'draft',
      kind: 'attribute',
      text: 'dusk light',
      enabled: true,
      weight: 6,
      category: 'lighting',
      parentIds: ['e1'],
    },
  ],
});

/** 노드 하나를 고친 요청 스냅샷. */
const edit = (id: string, patch: Partial<Node>): NodeSnapshot => {
  const snapshot = base();
  snapshot.nodes = snapshot.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
  return snapshot;
};

describe('planRevision', () => {
  it.each([
    ['keyword weight', 'k1', { weight: 3 }, 'assemble', 'weight'],
    ['keyword enabled', 'k1', { enabled: false }, 'assemble', 'enabled'],
    [
      'keyword pad',
      'k1',
      { pad: { x: 2, y: 0, xAxis: [...axes.xAxis], yAxis: [...axes.yAxis] } },
      'assemble',
      'pad',
    ],
    ['attribute weight', 'a1', { weight: 1 }, 'assemble', 'weight'],
    ['attribute enabled', 'a1', { enabled: false }, 'assemble', 'enabled'],
    ['dataType enabled', 'd1', { enabled: false }, 'evidence', 'enabled'],
    ['priority order', 's1', { order: 1 }, 'evidence', 'order'],
    ['priority enabled', 's1', { enabled: false }, 'evidence', 'enabled'],
    ['evidence enabled', 'e1', { enabled: false }, 'draft', 'enabled'],
  ] as const)('%s -> %s start', (_name, id, patch, stage, field) => {
    expect(planRevision(base(), edit(id, patch as Partial<Node>))).toEqual({
      kind: 'ok',
      startStage: stage,
      changes: [{ nodeId: id, field }],
    });
  });

  it('picks the earliest stage and lists every change', () => {
    const next = edit('e1', { enabled: false });
    next.nodes = next.nodes.map((n) =>
      n.id === 'a1' ? { ...n, weight: 2 } : n.id === 'd1' ? { ...n, enabled: false } : n,
    );
    expect(planRevision(base(), next)).toEqual({
      kind: 'ok',
      startStage: 'evidence',
      changes: [
        { nodeId: 'd1', field: 'enabled' },
        { nodeId: 'e1', field: 'enabled' },
        { nodeId: 'a1', field: 'weight' },
      ],
    });
  });

  it('reports one change per edited field of a node', () => {
    const plan = planRevision(base(), edit('k1', { weight: 2, enabled: false }));
    expect(plan).toMatchObject({ kind: 'ok', startStage: 'assemble' });
    if (plan.kind === 'ok') expect(plan.changes).toHaveLength(2);
  });

  it('returns none when nothing changed', () => {
    expect(planRevision(base(), base())).toEqual({ kind: 'none' });
  });

  it('ignores the order of the nodes array', () => {
    const next = base();
    next.nodes.reverse();
    expect(planRevision(base(), next)).toEqual({ kind: 'none' });
  });

  it('treats criterion enabled changes as no regeneration', () => {
    const withCriterion = (enabled: boolean): NodeSnapshot => {
      const snapshot = base();
      snapshot.nodes.push({
        id: 'v1',
        stage: 'verify',
        kind: 'criterion',
        text: 'The image shows dusk light.',
        enabled,
        parentIds: ['a1'],
      });
      return snapshot;
    };
    expect(planRevision(withCriterion(true), withCriterion(false))).toEqual({ kind: 'none' });
  });

  it.each([
    ['text', 'k1', { text: 'tower' }],
    ['weight on a dataType', 'd1', { weight: 3 }],
    ['pad on an attribute', 'a1', { pad: { x: 1, y: 1, xAxis: ['A', 'B'], yAxis: ['C', 'D'] } }],
    ['order on a keyword', 'k1', { order: 3 }],
    ['parentIds', 'a1', { parentIds: ['k1'] }],
    [
      'pad axis names',
      'k1',
      { pad: { x: 0, y: 0, xAxis: ['A', 'B'], yAxis: ['Horizon', 'Surrounding'] } },
    ],
    ['kind', 'a1', { kind: 'keyword' }],
  ] as const)('rejects an unsupported edit: %s', (_name, id, patch) => {
    expect(planRevision(base(), edit(id, patch as Partial<Node>)).kind).toBe('invalid');
  });

  it('rejects added, removed and renamed nodes and a changed subject template', () => {
    const added = base();
    added.nodes.push({
      id: 'a2',
      stage: 'draft',
      kind: 'attribute',
      text: 'mist',
      enabled: true,
      weight: 3,
      parentIds: ['e1'],
    });
    const removed = base();
    removed.nodes.pop();
    const renamed = base();
    renamed.nodes[4] = { ...renamed.nodes[4]!, id: 'a9' };
    const subject = { ...base(), subjectTemplate: '{k1}' };
    for (const next of [added, removed, renamed, subject]) {
      expect(planRevision(base(), next).kind).toBe('invalid');
    }
  });
});
