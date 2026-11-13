import type {
  CompareResponse,
  CreatorSummary,
  IdentityAxes,
  IdentityMetrics,
  IdentitySnapshot,
} from '@tome/shared';
import { describe, expect, it } from 'vitest';
import {
  MIN_EVENTS_FOR_AXES,
  axisRows,
  chartPoint,
  compareMarkers,
  formatDay,
  identityView,
  metricsView,
  quadrantOf,
} from './identity';

const AXES: IdentityAxes = {
  scaleIntensity: -40,
  aiRelation: 60,
  decisionBasis: -20,
  direction: 80,
};

const METRICS: IdentityMetrics = {
  sessions: 48,
  nodeEdits: 14,
  reasonedRatio: 0.537,
  firstRecordedAt: '2026-11-01T09:00:00.000Z',
  lastActiveAt: '2026-11-12T15:30:00.000Z',
  originBreakdown: { own: 10, remix: 3, derived: 1 },
};

function snapshot(overrides: Partial<IdentitySnapshot> = {}): IdentitySnapshot {
  return {
    algoVersion: 'identity-v1',
    axes: AXES,
    metrics: METRICS,
    eventCount: 30,
    projectCount: 2,
    provisional: true,
    computedAt: '2026-11-12T15:31:00.000Z',
    ...overrides,
  };
}

function creator(id: string, displayName: string): CreatorSummary {
  return { id, kind: 'seed', displayName, bio: null, avatarUrl: null };
}

const ME = creator('5b1d6c0e-2f43-4a8e-9c1b-7a3e5d2f8b10', 'Julian');
const WILLIAM = creator('7d9e1c2a-6b5f-4a3e-9d8c-1b2a3c4d5e6f', 'William');
const JUDY = creator('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'Judy');

describe('chartPoint', () => {
  it('−100 은 왼쪽·위 끝(0%), 0 은 가운데(50%), +100 은 오른쪽·아래 끝(100%)', () => {
    const edges: IdentityAxes = {
      scaleIntensity: -100,
      aiRelation: 100,
      decisionBasis: 0,
      direction: 0,
    };
    expect(chartPoint(edges, 'ai')).toEqual({ left: 100, top: 0 });
    expect(chartPoint(edges, 'decision')).toEqual({ left: 50, top: 50 });
  });

  it('ai 좌표는 가로 = AI와의 관계, 세로 = 조작 강도', () => {
    expect(chartPoint(AXES, 'ai')).toEqual({ left: 80, top: 30 });
  });

  it('decision 좌표는 가로 = 판단 근거, 세로 = 방향', () => {
    expect(chartPoint(AXES, 'decision')).toEqual({ left: 40, top: 90 });
  });

  it('범위를 벗어난 점수는 끝에 맞추고, 점수가 하나라도 없으면 null', () => {
    expect(chartPoint({ ...AXES, aiRelation: 250 }, 'ai')?.left).toBe(100);
    expect(chartPoint({ ...AXES, scaleIntensity: null }, 'ai')).toBeNull();
    expect(chartPoint({ ...AXES, scaleIntensity: null }, 'decision')).not.toBeNull();
  });
});

describe('quadrantOf', () => {
  it('세로 음수 = 위, 가로 음수 = 왼쪽', () => {
    expect(quadrantOf(AXES, 'ai')).toBe('top-right');
    expect(quadrantOf(AXES, 'decision')).toBe('bottom-left');
  });

  it('축 위(정확히 0)거나 점수가 없으면 null', () => {
    expect(quadrantOf({ ...AXES, aiRelation: 0 }, 'ai')).toBeNull();
    expect(quadrantOf({ ...AXES, direction: null }, 'decision')).toBeNull();
  });
});

describe('identityView', () => {
  it('스냅샷이 없으면 기록 중, 잠정', () => {
    expect(identityView(null)).toEqual({
      state: 'recording',
      provisional: true,
      points: { ai: null, decision: null },
    });
  });

  it('이벤트가 20개 미만이면 좌표를 찍지 않는다', () => {
    const view = identityView(snapshot({ eventCount: MIN_EVENTS_FOR_AXES - 1 }));
    expect(view.state).toBe('recording');
    expect(view.points).toEqual({ ai: null, decision: null });
  });

  it('이벤트가 20개 이상이면 좌표를 찍고, 잠정 여부는 서버 값을 따른다', () => {
    const view = identityView(snapshot({ eventCount: MIN_EVENTS_FOR_AXES }));
    expect(view.state).toBe('ready');
    expect(view.provisional).toBe(true);
    expect(view.points.ai).toEqual({ left: 80, top: 30 });
    expect(identityView(snapshot({ provisional: false })).provisional).toBe(false);
  });

  it('이벤트가 많아도 축이 전부 비면 기록 중', () => {
    const empty: IdentityAxes = {
      scaleIntensity: null,
      aiRelation: null,
      decisionBasis: null,
      direction: null,
    };
    expect(identityView(snapshot({ axes: empty, eventCount: 100 })).state).toBe('recording');
  });
});

describe('metricsView', () => {
  it('Depth 는 반올림한 %, 기간은 절대 날짜로 보여 준다', () => {
    expect(metricsView(METRICS, 'en-US', 'UTC')).toEqual({
      sessions: 48,
      nodeEdits: 14,
      depthPercent: 54,
      firstRecorded: 'Nov 1, 2026',
      lastActive: 'Nov 12, 2026',
    });
  });

  it('기록 날짜가 없으면 null', () => {
    const view = metricsView({ ...METRICS, firstRecordedAt: null, lastActiveAt: null });
    expect(view.firstRecorded).toBeNull();
    expect(view.lastActive).toBeNull();
    expect(formatDay(null)).toBeNull();
  });
});

describe('axisRows', () => {
  it('정해진 순서로 정렬하고, 빠진 축은 null, 점수는 반올림', () => {
    expect(
      axisRows([
        { axis: 'direction', score: 79.6 },
        { axis: 'aiRelation', score: 60 },
        { axis: 'decisionBasis', score: null },
      ]),
    ).toEqual([
      { axis: 'aiRelation', score: 60 },
      { axis: 'scaleIntensity', score: null },
      { axis: 'decisionBasis', score: null },
      { axis: 'direction', score: 80 },
    ]);
  });
});

describe('compareMarkers', () => {
  const compare: CompareResponse = {
    me: { creator: ME, axes: AXES, provisional: true },
    others: [
      {
        creator: WILLIAM,
        axes: { scaleIntensity: 20, aiRelation: -50, decisionBasis: 30, direction: -60 },
        provisional: false,
      },
      {
        creator: JUDY,
        axes: { scaleIntensity: null, aiRelation: 10, decisionBasis: 40, direction: 10 },
        provisional: false,
      },
    ],
  };

  it('점수가 없는 사람은 빼고, 나는 맨 마지막에 둔다', () => {
    const markers = compareMarkers(compare, 'ai');
    expect(markers.map((m) => m.creator.displayName)).toEqual(['William', 'Julian']);
    expect(markers.at(-1)?.me).toBe(true);
    expect(markers[0]?.point).toEqual({ left: 25, top: 60 });
  });

  it('좌표마다 따로 계산한다', () => {
    expect(compareMarkers(compare, 'decision').map((m) => m.creator.displayName)).toEqual([
      'William',
      'Judy',
      'Julian',
    ]);
  });
});
