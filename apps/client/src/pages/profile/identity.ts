import {
  LIMITS,
  type CompareResponse,
  type CreatorSummary,
  type IdentityAxes,
  type IdentityMetrics,
  type IdentitySnapshot,
  type IdentityTableRow,
} from '@tome/shared';

/** 기록 이벤트가 이보다 적으면 좌표를 찍지 않고 "기록 중"만 보여 준다. */
export const MIN_EVENTS_FOR_AXES = 20;

/** ai = "How do I work with AI?" 좌표, decision = "How do I make a decision?" 좌표 */
export type ChartKey = 'ai' | 'decision';

type AxisKey = keyof IdentityAxes;

/**
 * 좌표 한 장에 쓰는 두 축. 가로는 −100이 왼쪽·+100이 오른쪽, 세로는 −100이 위·+100이 아래다.
 * ai: 가로 = AI와의 관계(왼쪽 자율 존중 ↔ 오른쪽 주도), 세로 = 조작 강도(위 약하게 ↔ 아래 과감하게)
 * decision: 가로 = 판단 근거(왼쪽 근거 ↔ 오른쪽 직관), 세로 = 방향(위 수렴 ↔ 아래 발산)
 */
export const CHART_AXES: Readonly<Record<ChartKey, { x: AxisKey; y: AxisKey }>> = {
  ai: { x: 'aiRelation', y: 'scaleIntensity' },
  decision: { x: 'decisionBasis', y: 'direction' },
};

/** 화면 읽기 프로그램용 숨김 표의 행 순서(좌표 1의 가로·세로, 좌표 2의 가로·세로) */
export const AXIS_ORDER: readonly AxisKey[] = [
  'aiRelation',
  'scaleIntensity',
  'decisionBasis',
  'direction',
];

export interface ChartPoint {
  /** 왼쪽에서부터의 위치(0~100%) */
  left: number;
  /** 위에서부터의 위치(0~100%) */
  top: number;
}

function toPercent(score: number): number {
  const min = LIMITS.AXIS_SCORE_MIN;
  const max = LIMITS.AXIS_SCORE_MAX;
  const clamped = Math.min(Math.max(score, min), max);
  return ((clamped - min) / (max - min)) * 100;
}

/** 축 점수 두 개를 좌표 위 위치(%)로 바꾼다. 둘 중 하나라도 없으면 null(찍지 않음). */
export function chartPoint(axes: IdentityAxes, chart: ChartKey): ChartPoint | null {
  const { x, y } = CHART_AXES[chart];
  const sx = axes[x];
  const sy = axes[y];
  if (sx === null || sy === null) return null;
  return { left: toPercent(sx), top: toPercent(sy) };
}

export type Quadrant = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** 점이 놓인 사분면. 점수가 없거나 축 위(정확히 0)에 있으면 null 이라 말풍선을 띄우지 않는다. */
export function quadrantOf(axes: IdentityAxes, chart: ChartKey): Quadrant | null {
  const { x, y } = CHART_AXES[chart];
  const sx = axes[x];
  const sy = axes[y];
  if (sx === null || sy === null || sx === 0 || sy === 0) return null;
  return `${sy < 0 ? 'top' : 'bottom'}-${sx < 0 ? 'left' : 'right'}`;
}

export interface IdentityView {
  /** recording = "기록 중"(좌표 없음), ready = 좌표를 찍는다 */
  state: 'recording' | 'ready';
  /** 잠정 표시("may change")를 붙이면 true */
  provisional: boolean;
  points: Record<ChartKey, ChartPoint | null>;
}

const NO_POINTS: Record<ChartKey, ChartPoint | null> = { ai: null, decision: null };

/**
 * 아이덴티티 화면 상태. 스냅샷이 없거나 이벤트가 20개 미만이거나 찍을 점이 하나도 없으면 "기록 중".
 * 잠정 여부는 서버가 정한 값(프로젝트 수 기준)을 그대로 쓴다.
 */
export function identityView(snapshot: IdentitySnapshot | null): IdentityView {
  if (snapshot === null) return { state: 'recording', provisional: true, points: NO_POINTS };
  const points = {
    ai: chartPoint(snapshot.axes, 'ai'),
    decision: chartPoint(snapshot.axes, 'decision'),
  };
  const hasPoint = points.ai !== null || points.decision !== null;
  const ready = snapshot.eventCount >= MIN_EVENTS_FOR_AXES && hasPoint;
  return {
    state: ready ? 'ready' : 'recording',
    provisional: snapshot.provisional,
    points: ready ? points : NO_POINTS,
  };
}

/** ISO 시각을 절대 날짜로(전시 기기 로케일). 값이 없으면 null. */
export function formatDay(iso: string | null, locale?: string, timeZone?: string): string | null {
  if (iso === null) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(new Date(iso));
}

export interface MetricsView {
  sessions: number;
  nodeEdits: number;
  /** 이유를 남긴 편집 비율. 반올림한 정수 % */
  depthPercent: number;
  /** 첫 기록 날짜(절대 날짜) */
  firstRecorded: string | null;
  /** 마지막 활동 날짜(절대 날짜) */
  lastActive: string | null;
}

/** 왼쪽 지표 3개(Scale·Depth·Duration)에 보여 줄 값. 기간은 상대 표기 없이 날짜로만 보여 준다. */
export function metricsView(
  metrics: IdentityMetrics,
  locale?: string,
  timeZone?: string,
): MetricsView {
  return {
    sessions: metrics.sessions,
    nodeEdits: metrics.nodeEdits,
    depthPercent: Math.round(metrics.reasonedRatio * 100),
    firstRecorded: formatDay(metrics.firstRecordedAt, locale, timeZone),
    lastActive: formatDay(metrics.lastActiveAt, locale, timeZone),
  };
}

export interface AxisRow {
  axis: AxisKey;
  /** 반올림한 축 점수. 데이터가 없으면 null */
  score: number | null;
}

/** 숨김 표의 행. 서버가 준 순서와 상관없이 AXIS_ORDER 순서로, 빠진 축은 null 로 채운다. */
export function axisRows(table: readonly IdentityTableRow[]): AxisRow[] {
  return AXIS_ORDER.map((axis) => {
    const score = table.find((row) => row.axis === axis)?.score ?? null;
    return { axis, score: score === null ? null : Math.round(score) };
  });
}

export interface CompareMarker {
  creator: CreatorSummary;
  /** 나(Me)면 true */
  me: boolean;
  point: ChartPoint;
}

/** Compare 좌표에 찍을 아바타들. 점수가 없는 사람은 빼고, 나는 맨 마지막(맨 위에 그려짐)에 둔다. */
export function compareMarkers(compare: CompareResponse, chart: ChartKey): CompareMarker[] {
  const markers: CompareMarker[] = [];
  for (const other of compare.others) {
    const point = chartPoint(other.axes, chart);
    if (point !== null) markers.push({ creator: other.creator, me: false, point });
  }
  const mine = chartPoint(compare.me.axes, chart);
  if (mine !== null) markers.push({ creator: compare.me.creator, me: true, point: mine });
  return markers;
}
