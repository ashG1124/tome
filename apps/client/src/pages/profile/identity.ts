import {
  LIMITS,
  type CompareEntry,
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
 * 좌표 한 장에 쓰는 두 축. 세로는 −100이 위·+100이 아래다(Figma 그대로).
 * 가로는 X_SIGN 이 +1 이면 +100이 오른쪽, −1 이면 +100이 왼쪽이다.
 * ai: 가로 = AI와의 관계(왼쪽 자율 존중 ↔ 오른쪽 주도, + 가 오른쪽), 세로 = 조작 강도(위 약하게 ↔ 아래 과감하게)
 * decision: 가로 = 판단 근거(왼쪽 근거 ↔ 오른쪽 직관). 서버 점수는 + 가 근거(Evidence)라서 + 를 왼쪽에 찍는다.
 *           세로 = 방향(위 수렴 ↔ 아래 발산)
 */
export const CHART_AXES: Readonly<Record<ChartKey, { x: AxisKey; y: AxisKey }>> = {
  ai: { x: 'aiRelation', y: 'scaleIntensity' },
  decision: { x: 'decisionBasis', y: 'direction' },
};

/** 가로축 방향: +1 이면 + 점수가 오른쪽, −1 이면 왼쪽. 판단 근거는 + = Evidence = 왼쪽이다. */
const X_SIGN: Readonly<Record<ChartKey, 1 | -1>> = { ai: 1, decision: -1 };

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
  return { left: toPercent(X_SIGN[chart] * sx), top: toPercent(sy) };
}

export type Quadrant = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** 점이 놓인 사분면. 점수가 없거나 축 위(정확히 0)에 있으면 null 이라 말풍선을 띄우지 않는다. */
export function quadrantOf(axes: IdentityAxes, chart: ChartKey): Quadrant | null {
  const { x, y } = CHART_AXES[chart];
  const sx = axes[x];
  const sy = axes[y];
  if (sx === null || sy === null || sx === 0 || sy === 0) return null;
  // 화면 기준 가로 위치로 본다(판단 근거는 + 가 왼쪽)
  return `${sy < 0 ? 'top' : 'bottom'}-${X_SIGN[chart] * sx < 0 ? 'left' : 'right'}`;
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
  /** 이유를 남긴 편집 비율. 반올림한 정수 %. 값이 없으면 null(화면은 "—") */
  depthPercent: number | null;
  /** 첫 기록 날짜(절대 날짜) */
  firstRecorded: string | null;
  /** 마지막 활동 날짜(절대 날짜) */
  lastActive: string | null;
}

/**
 * 이유를 남긴 편집 비율(0~1)을 반올림한 %로. 서버가 아직 셀 편집이 없어 null 을 주면 null.
 * 지금 공유 스키마는 number 지만 null 허용으로 바뀔 예정이라(#36) 미리 null 도 받는다.
 */
export function depthPercentOf(ratio: number | null): number | null {
  return ratio === null ? null : Math.round(ratio * 100);
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
    depthPercent: depthPercentOf(metrics.reasonedRatio),
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

/** 좌표 위 사람 한 명(다른 창작자). */
export interface ChartPerson {
  creator: CreatorSummary;
  point: ChartPoint;
}

/** 좌표 한 장에 찍을 다른 창작자들. 점수가 없는 사람은 뺀다. */
export function chartPeople(entries: readonly CompareEntry[], chart: ChartKey): ChartPerson[] {
  const people: ChartPerson[] = [];
  for (const entry of entries) {
    const point = chartPoint(entry.axes, chart);
    if (point !== null) people.push({ creator: entry.creator, point });
  }
  return people;
}

/**
 * 두 사람의 닮은 정도(0~100, 반올림). 둘 다 점수가 있는 축만 보고, 축마다 점수 차이를 전체 폭(200)으로 나눈 값의
 * 평균을 100 에서 뺀다. 같이 가진 축이 하나도 없으면 null.
 */
export function similarityOf(a: IdentityAxes, b: IdentityAxes): number | null {
  const range = LIMITS.AXIS_SCORE_MAX - LIMITS.AXIS_SCORE_MIN;
  let total = 0;
  let count = 0;
  for (const axis of AXIS_ORDER) {
    const x = a[axis];
    const y = b[axis];
    if (x === null || y === null) continue;
    total += Math.abs(x - y) / range;
    count += 1;
  }
  if (count === 0) return null;
  return Math.round(100 - (total / count) * 100);
}

/** Similarity 막대 한 칸(10). 막대는 0 부터 이 값의 배수까지 고른다(Figma Drag · 0~10 … 0~100). */
export const SIMILARITY_STEP = 10;
export const SIMILARITY_MAX = 100;

export interface CreatorFilter {
  /** 이름 검색어(앞뒤 공백 무시, 대소문자 무시) */
  query: string;
  /** 닮은 정도 위 끝(0~이 값). 100 이면 거르지 않는다 */
  similarityMax: number;
  /** 좌표별로 고른 사분면. null 이면 그 좌표로는 거르지 않는다 */
  quadrants: Record<ChartKey, Quadrant | null>;
}

export const DEFAULT_FILTER: CreatorFilter = {
  query: '',
  similarityMax: SIMILARITY_MAX,
  quadrants: { ai: null, decision: null },
};

/** 무엇이든 걸러지고 있으면 true. 이때 좌표에 걸린 사람의 사진·이름·선을 보여 준다. */
export function isFilterActive(filter: CreatorFilter): boolean {
  return (
    filter.query.trim() !== '' ||
    filter.similarityMax < SIMILARITY_MAX ||
    filter.quadrants.ai !== null ||
    filter.quadrants.decision !== null
  );
}

/**
 * 오른쪽 목록에 남길 사람. 이름 검색어·닮은 정도(기준 점수가 있을 때만)·사분면을 모두 통과해야 한다.
 * 닮은 정도로 거를 때 기준 점수나 상대 점수가 없어 셀 수 없는 사람은 뺀다.
 */
export function filterCreators(
  entries: readonly CompareEntry[],
  focalAxes: IdentityAxes | null,
  filter: CreatorFilter,
): CompareEntry[] {
  const query = filter.query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (query !== '' && !entry.creator.displayName.toLowerCase().includes(query)) return false;
    if (filter.similarityMax < SIMILARITY_MAX) {
      const similarity = focalAxes === null ? null : similarityOf(focalAxes, entry.axes);
      if (similarity === null || similarity > filter.similarityMax) return false;
    }
    for (const chart of ['ai', 'decision'] as const) {
      const wanted = filter.quadrants[chart];
      if (wanted !== null && quadrantOf(entry.axes, chart) !== wanted) return false;
    }
    return true;
  });
}
