import type { IdentityAxes } from '@tome/shared';
import { describe, expect, it } from 'vitest';
import {
  axisOfNode,
  CONNECTION_TEMPLATES,
  isDivergent,
  planConnections,
  renderSentence,
  templateKeyFor,
} from './remix.rules';

const axes = (over: Partial<IdentityAxes>): IdentityAxes => ({
  scaleIntensity: null,
  aiRelation: null,
  decisionBasis: null,
  direction: null,
  ...over,
});
const signals = (plus: number, minus: number) => [
  ...Array<number>(plus).fill(1),
  ...Array<number>(minus).fill(-1),
];
const none = { scaleIntensity: [], aiRelation: [], decisionBasis: [] };
const k = (id: string) => ({ id, stage: 'analyze' as const, kind: 'keyword' as const });

describe('isDivergent', () => {
  it('needs |p| >= 20', () => {
    expect(isDivergent(19, -50)).toBe(false);
    expect(isDivergent(20, -50)).toBe(true);
    expect(isDivergent(-19, 50)).toBe(false);
    expect(isDivergent(null, -50)).toBe(false);
  });
  it('gap boundary 39/40 with the same sign', () => {
    expect(isDivergent(60, 21)).toBe(false); // gap 39
    expect(isDivergent(60, 20)).toBe(true); // gap 40
  });
  it('opposite sign always counts; null or missing mine is 0', () => {
    expect(isDivergent(20, -1)).toBe(true);
    expect(isDivergent(39, null)).toBe(false);
    expect(isDivergent(40, null)).toBe(true);
    expect(isDivergent(-40, 0)).toBe(true);
  });
});

describe('axisOfNode', () => {
  it('maps priority to A, draft stage to B, tagged others to C', () => {
    expect(axisOfNode({ id: 's1', stage: 'research', kind: 'priority' })).toBe('scaleIntensity');
    expect(axisOfNode({ id: 'a1', stage: 'draft', kind: 'attribute' })).toBe('aiRelation');
    expect(axisOfNode(k('k1'))).toBe('decisionBasis');
    expect(axisOfNode({ id: 'e1', stage: 'evidence', kind: 'evidence' })).toBe('decisionBasis');
    expect(axisOfNode({ id: 'v1', stage: 'verify', kind: 'criterion' })).toBeNull();
    expect(axisOfNode({ id: 'm1', stage: 'analyze', kind: 'keyword' })).toBeNull();
  });
});

describe('templates', () => {
  it('has six templates picked by axis and direction', () => {
    expect(Object.keys(CONNECTION_TEMPLATES)).toHaveLength(6);
    expect(templateKeyFor('decisionBasis', 1)).toBe('basis.evidence');
    expect(templateKeyFor('decisionBasis', -1)).toBe('basis.intuitive');
    expect(templateKeyFor('scaleIntensity', 1)).toBe('scale.bold');
    expect(templateKeyFor('scaleIntensity', -1)).toBe('scale.passive');
    expect(templateKeyFor('aiRelation', 1)).toBe('relation.dominant');
    expect(templateKeyFor('aiRelation', -1)).toBe('relation.autonomy');
    expect(renderSentence('basis.evidence', 7, 10)).toBe('Leaned on evidence 7 of 10 times');
  });
});

describe('planConnections', () => {
  const base = { myAxes: axes({ decisionBasis: -50 }), partnerAxes: axes({ decisionBasis: 60 }) };
  it('hides when the partner has fewer than 3 manipulations on the axis', () => {
    const s2 = { ...none, decisionBasis: signals(2, 0) };
    expect(planConnections({ ...base, nodes: [k('k1')], partnerSignals: s2 })).toEqual([]);
    const s3 = { ...none, decisionBasis: signals(3, 0) };
    const [one] = planConnections({ ...base, nodes: [k('k1')], partnerSignals: s3 });
    expect(one).toMatchObject({
      evidenceCount: 3,
      evidenceTotal: 3,
      templateKey: 'basis.evidence',
    });
  });
  it('counts only signals in the direction of p', () => {
    const [one] = planConnections({
      myAxes: axes({ decisionBasis: 50 }),
      partnerAxes: axes({ decisionBasis: -60 }),
      nodes: [k('k1')],
      partnerSignals: { ...none, decisionBasis: signals(3, 7) },
    });
    expect(one).toMatchObject({
      evidenceCount: 7,
      evidenceTotal: 10,
      templateKey: 'basis.intuitive',
    });
    expect(one!.sentence).toBe('Went with intuition 7 of 10 times');
  });
  it('sorts by ratio then nodeId', () => {
    const out = planConnections({
      nodes: [
        { id: 'a1', stage: 'draft', kind: 'attribute' },
        { id: 's1', stage: 'research', kind: 'priority' },
        k('k2'),
        k('k1'),
      ],
      myAxes: null,
      partnerAxes: axes({ decisionBasis: 60, aiRelation: 60, scaleIntensity: 60 }),
      partnerSignals: {
        decisionBasis: signals(6, 4), // 6/10
        aiRelation: signals(9, 1), // 9/10
        scaleIntensity: signals(5, 0), // 5/5
      },
    });
    expect(out.map((o) => o.nodeId)).toEqual(['s1', 'a1', 'k1', 'k2']);
  });
});
