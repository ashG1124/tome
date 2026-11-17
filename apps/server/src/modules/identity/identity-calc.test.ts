import { describe, expect, it } from 'vitest';
import {
  type CalcEvent,
  type CalcSetStat,
  calculateIdentity,
  countSessions,
  domainOf,
} from './identity-calc';

const T0 = Date.parse('2026-11-17T00:00:00.000Z');
let counter = 0;
function ev(type: string, payload: Record<string, unknown> = {}, extra: Partial<CalcEvent> = {}) {
  counter += 1;
  return {
    type,
    sessionId: 's1',
    serverTs: new Date(T0 + counter * 1000),
    setId: 'set1',
    origin: 'own',
    payload,
    ...extra,
  } as CalcEvent;
}
const many = (n: number, make: () => CalcEvent) => Array.from({ length: n }, make);
const noSets: CalcSetStat[] = [];
const run = (events: CalcEvent[], setStats = noSets, projectCount = 3) =>
  calculateIdentity({ events, setStats, projectCount });
const filler = (n: number) => many(n, () => ev('canvas_revealed'));

describe('metrics', () => {
  it('T-1: 3 reasoned of 5 gives 0.6', () => {
    const events = [
      ev('draft_apply', { reason: 'a' }),
      ev('draft_apply', { reason: 'b' }),
      ev('weight_apply', { reason: 'c' }),
      ev('draft_apply', { reason: '' }),
      ev('draft_apply', { reason: '  ' }),
    ];
    expect(run(events).metrics.reasonedRatio).toBeCloseTo(0.6);
  });

  it('gives null when the denominator is 4 and a value at 5', () => {
    const four = many(4, () => ev('draft_apply', { reason: 'x' }));
    expect(run(four).metrics.reasonedRatio).toBeNull();
    expect(run([...four, ev('flag_decision', { reason: 'x' })]).metrics.reasonedRatio).toBe(1);
  });

  it('zero events: everything null', () => {
    const result = run([]);
    expect(result.axes).toEqual({
      scaleIntensity: null,
      aiRelation: null,
      decisionBasis: null,
      direction: null,
    });
    expect(result.metrics.reasonedRatio).toBeNull();
    expect(result.metrics.firstRecordedAt).toBeNull();
    expect(result.metrics.lastActiveAt).toBeNull();
    expect(result.metrics.sessions).toBe(0);
  });

  it('counts version_save as node edits and splits origins', () => {
    const events = [
      ev('version_save'),
      ev('version_save', {}, { origin: 'remix' }),
      ev('node_open', {}, { origin: 'derived' }),
    ];
    const { metrics } = run(events);
    expect(metrics.nodeEdits).toBe(2);
    expect(metrics.originBreakdown).toEqual({ own: 1, remix: 1, derived: 1 });
    expect(metrics.firstRecordedAt).toBe(events[0]!.serverTs.toISOString());
    expect(metrics.lastActiveAt).toBe(events[2]!.serverTs.toISOString());
  });

  it('starts a new session after a 30 minute gap with the same sessionId', () => {
    const at = (ms: number) => ({ sessionId: 'a', serverTs: new Date(T0 + ms) });
    expect(countSessions([at(0), at(29 * 60_000)])).toBe(1);
    expect(countSessions([at(0), at(30 * 60_000)])).toBe(2);
    expect(countSessions([at(0), { sessionId: 'b', serverTs: new Date(T0) }])).toBe(2);
  });
});

describe('axes', () => {
  it('T-2: 7 evidence vs 3 intuitive gives +40', () => {
    const events = [
      ...many(7, () => ev('node_open', { nodeId: 'e1' })),
      ...many(3, () => ev('node_open', { nodeId: 'k1' })),
      ...filler(10),
    ];
    expect(run(events).axes.decisionBasis).toBe(40);
  });

  it('T-3: weight 5→9, pad (0,0)→(3,4), no order change gives about -47', () => {
    const events = [
      ev('weight_dial_click', {
        weightAi: 5,
        weightFinal: 9,
        padAi: { x: 0, y: 0 },
        padFinal: { x: 3, y: 4 },
        orderChanged: false,
      }),
      ...filler(19),
    ];
    expect(run(events).axes.scaleIntensity).toBe(-47);
  });

  it('T-4: 2 projects with 30 events is provisional and has axes', () => {
    const events = [...many(10, () => ev('draft_apply', { changed: true })), ...filler(20)];
    const result = run(events, noSets, 2);
    expect(result.provisional).toBe(true);
    expect(result.eventCount).toBe(30);
    expect(result.axes.aiRelation).toBe(100);
    expect(run(events, noSets, 3).provisional).toBe(false);
  });

  it('axes are null at 19 events and present at 20', () => {
    const make = (n: number) => many(n, () => ev('draft_apply', { changed: true }));
    expect(run(make(19)).axes.aiRelation).toBeNull();
    expect(run(make(20)).axes.aiRelation).toBe(100);
  });

  it('axis B is null when no event carries a signal', () => {
    expect(run(filler(25)).axes.aiRelation).toBeNull();
  });

  it('axis B mixes kept/removed/changed signals', () => {
    const events = [
      ev('flag_decision', { state: 'kept' }),
      ev('flag_decision', { state: 'removed' }),
      ev('flag_decision', { state: 'removed' }),
      ev('priority_drag_reorder', { orderChanged: false }),
      ...filler(20),
    ];
    expect(run(events).axes.aiRelation).toBe(-50);
  });

  it('axis D uses per-set averages against the reference values', () => {
    const keys = ['k1', 'k2', 'k3', 'k4', 'k5'].map((nodeId) => ev('node_open', { nodeId }));
    const events = [...keys, ...filler(15)];
    expect(run(events, [{ attemptCount: 3, acceptedCount: 2 }]).axes.direction).toBe(0);
    expect(run(events, [{ attemptCount: 6, acceptedCount: 2 }]).axes.direction).toBe(33);
    expect(run(events, [{ attemptCount: 0, acceptedCount: 0 }]).axes.direction).toBe(-67);
    expect(run(events, noSets).axes.direction).toBeNull();
  });

  it('skips unreadable signals without failing', () => {
    const events = [
      ev('weight_dial_click', { weightAi: 5 }),
      ev('meaning_point_set', { padAi: 'x' }),
      ...filler(20),
    ];
    expect(run(events).axes.scaleIntensity).toBeNull();
  });
});

describe('domainOf', () => {
  it('tags by node id prefix', () => {
    expect(['d1', 's2', 'e3'].map(domainOf)).toEqual(['evidence', 'evidence', 'evidence']);
    expect(['k1', 'a1'].map(domainOf)).toEqual(['intuitive', 'intuitive']);
    expect(domainOf('v1')).toBeNull();
  });
});
