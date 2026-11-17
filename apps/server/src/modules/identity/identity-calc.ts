import type { IdentityAxes, IdentityMetrics } from '@tome/shared';

/** 계산 규칙 버전. 공식·REF 를 바꾸면 올린다(저장된 스냅샷은 다시 계산된다). */
export const ALGO_VERSION = 'identity-v1';

/** 공식에 쓰는 상수는 모두 여기에 둔다. */
export const IDENTITY_CONSTANTS = {
  /** 무활동이 이만큼 이어지면 같은 세션 id 라도 새 세션으로 본다. */
  SESSION_GAP_MS: 30 * 60 * 1000,
  /** 이 개수 미만이면 4축을 계산하지 않는다. */
  MIN_EVENTS_FOR_AXES: 20,
  /** 이 개수 미만의 프로젝트면 잠정 표시. */
  MIN_PROJECTS_FINAL: 3,
  /** Depth 분모(이유를 남길 수 있는 편집 수)가 이 값 미만이면 비율을 주지 않는다. */
  MIN_REASONABLE_EDITS: 5,
  WEIGHT_RANGE: 9,
  /** 패드 −5~+5 두 축의 최대 거리 sqrt(10² + 10²). */
  PAD_DIST_MAX: Math.sqrt(200),
  /** 축 A 중립 기준(평균 강도). */
  REF_A: 0.5,
  /** 축 D 기준: 세트당 건드린 key 수·확정 전 시도 수·version 수. */
  REF_D_KEYS: 5,
  REF_D_ATTEMPTS: 3,
  REF_D_VERSIONS: 2,
} as const;

export type EventOrigin = 'own' | 'remix' | 'derived';

/** 계산이 읽는 이벤트 한 건(저장 모양에서 필요한 것만). */
export interface CalcEvent {
  type: string;
  sessionId: string | null;
  serverTs: Date;
  setId: string | null;
  origin: EventOrigin;
  payload: Record<string, unknown>;
}

/** 세트별 답변 수. attemptCount = 미리보기로 만들어진 시도 전체, acceptedCount = 확정된 version. */
export interface CalcSetStat {
  attemptCount: number;
  acceptedCount: number;
}

export interface CalcInput {
  events: CalcEvent[];
  setStats: CalcSetStat[];
  projectCount: number;
}

export interface CalcResult {
  axes: IdentityAxes;
  metrics: IdentityMetrics;
  provisional: boolean;
  eventCount: number;
  projectCount: number;
}

const REASONED_TYPES = new Set([
  'weight_apply',
  'draft_apply',
  'source_apply',
  'priority_apply',
  'flag_decision',
]);
/** 조작 이벤트(캔버스 표시·버전 이동은 세지 않는다). */
const MANIPULATION_TYPES = new Set([
  'weight_dial_click',
  'meaning_point_set',
  'priority_drag_reorder',
  'evidence_toggle',
  'draft_apply',
  'source_apply',
  'flag_decision',
  'node_open',
  'weight_apply',
  'priority_apply',
]);
const DOMAIN_TYPES = new Set([
  'node_open',
  'weight_apply',
  'source_apply',
  'draft_apply',
  'evidence_toggle',
]);
const STRENGTH_TYPES = new Set(['weight_dial_click', 'meaning_point_set', 'priority_drag_reorder']);

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const point = (value: unknown): { x: number; y: number } | null => {
  if (typeof value !== 'object' || value === null) return null;
  const { x, y } = value as Record<string, unknown>;
  const px = num(x);
  const py = num(y);
  return px === null || py === null ? null : { x: px, y: py };
};
const nodeIdOf = (event: CalcEvent): string | null => {
  const id = event.payload.nodeId;
  return typeof id === 'string' && id !== '' ? id : null;
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** −100~+100 점수(정수 반올림, −0 방지). */
const toScore = (ratio: number): number => Math.round(clamp(ratio, -1, 1) * 100) + 0;
const mean = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/** 노드 id 접두어로 성향 태그를 붙인다. dataType·priority·evidence → evidence, keyword·attribute → intuitive. */
export function domainOf(nodeId: string): 'evidence' | 'intuitive' | null {
  const prefix = nodeId[0];
  if (prefix === 'd' || prefix === 's' || prefix === 'e') return 'evidence';
  if (prefix === 'k' || prefix === 'a') return 'intuitive';
  return null;
}

/** 같은 sessionId 안에서 무활동이 SESSION_GAP_MS 이상이면 새 세션으로 센다. */
export function countSessions(events: Pick<CalcEvent, 'sessionId' | 'serverTs'>[]): number {
  const byId = new Map<string | null, number[]>();
  for (const event of events) {
    const list = byId.get(event.sessionId) ?? [];
    list.push(event.serverTs.getTime());
    byId.set(event.sessionId, list);
  }
  let sessions = 0;
  for (const times of byId.values()) {
    times.sort((a, b) => a - b);
    sessions += 1;
    for (let i = 1; i < times.length; i += 1) {
      if (times[i]! - times[i - 1]! >= IDENTITY_CONSTANTS.SESSION_GAP_MS) sessions += 1;
    }
  }
  return sessions;
}

/** 축 A: 값 변화 크기 평균. 읽을 수 없는 신호는 그 신호만 뺀다. */
function intensityScore(events: CalcEvent[]): number | null {
  const perEvent: number[] = [];
  for (const event of events) {
    if (!STRENGTH_TYPES.has(event.type)) continue;
    const signals: number[] = [];
    const weightAi = num(event.payload.weightAi);
    const weightFinal = num(event.payload.weightFinal);
    if (weightAi !== null && weightFinal !== null) {
      signals.push(Math.abs(weightFinal - weightAi) / IDENTITY_CONSTANTS.WEIGHT_RANGE);
    }
    const padAi = point(event.payload.padAi);
    const padFinal = point(event.payload.padFinal);
    if (padAi && padFinal) {
      const dist = Math.hypot(padFinal.x - padAi.x, padFinal.y - padAi.y);
      signals.push(dist / IDENTITY_CONSTANTS.PAD_DIST_MAX);
    }
    const n = num(event.payload.n);
    const delta = num(event.payload.orderDelta);
    if (event.payload.orderChanged === false) signals.push(0);
    else if (delta !== null && n !== null && n > 0) signals.push(delta / n);
    if (signals.length > 0) perEvent.push(clamp(mean(signals), 0, 1));
  }
  if (perEvent.length === 0) return null;
  return toScore((mean(perEvent) - IDENTITY_CONSTANTS.REF_A) * 2);
}

/** 축 B: 유저 주도(+) 대 자율 존중(−). */
function collaborationScore(events: CalcEvent[]): number | null {
  let lead = 0;
  let respect = 0;
  for (const event of events) {
    let leading: boolean | null = null;
    if (event.type === 'draft_apply' && typeof event.payload.changed === 'boolean') {
      leading = event.payload.changed;
    } else if (event.type === 'flag_decision') {
      if (event.payload.state === 'kept') leading = true;
      else if (event.payload.state === 'removed') leading = false;
    } else if (
      event.type === 'priority_drag_reorder' &&
      typeof event.payload.orderChanged === 'boolean'
    ) {
      leading = event.payload.orderChanged;
    }
    if (leading === true) lead += 1;
    else if (leading === false) respect += 1;
  }
  const total = lead + respect;
  if (total === 0) return null;
  return toScore((lead - respect) / total);
}

/** 축 C: (근거 노드 − 직관 노드) / 합. 문서의 공식과 테스트 표(T-2)를 그대로 따른다. */
function basisScore(events: CalcEvent[]): number | null {
  let evidence = 0;
  let intuitive = 0;
  for (const event of events) {
    if (!DOMAIN_TYPES.has(event.type)) continue;
    const nodeId = nodeIdOf(event);
    const domain = nodeId === null ? null : domainOf(nodeId);
    if (domain === 'evidence') evidence += 1;
    else if (domain === 'intuitive') intuitive += 1;
  }
  const total = evidence + intuitive;
  if (total === 0) return null;
  return toScore((evidence - intuitive) / total);
}

/** 축 D: 세트당 건드린 key·시도·version 을 기준값에 견줘 평균. 기준과 같으면 0, 많으면 발산(+). */
function directionScore(events: CalcEvent[], setStats: CalcSetStat[]): number | null {
  if (setStats.length === 0) return null;
  const keysBySet = new Map<string, Set<string>>();
  for (const event of events) {
    if (!MANIPULATION_TYPES.has(event.type) || event.setId === null) continue;
    const nodeId = nodeIdOf(event);
    if (nodeId === null) continue;
    const keys = keysBySet.get(event.setId) ?? new Set<string>();
    keys.add(nodeId);
    keysBySet.set(event.setId, keys);
  }
  // 건드린 key 는 이벤트가 있는 세트끼리, 시도·version 은 모든 세트로 평균한다.
  const keyAvg = keysBySet.size === 0 ? 0 : mean([...keysBySet.values()].map((keys) => keys.size));
  const attemptAvg = mean(setStats.map((stat) => stat.attemptCount));
  const versionAvg = mean(setStats.map((stat) => stat.acceptedCount));
  const normalized = mean([
    keyAvg / IDENTITY_CONSTANTS.REF_D_KEYS,
    attemptAvg / IDENTITY_CONSTANTS.REF_D_ATTEMPTS,
    versionAvg / IDENTITY_CONSTANTS.REF_D_VERSIONS,
  ]);
  return toScore(normalized - 1);
}

export function calculateIdentity(input: CalcInput): CalcResult {
  const { events, setStats, projectCount } = input;
  const eventCount = events.length;
  const provisional = projectCount < IDENTITY_CONSTANTS.MIN_PROJECTS_FINAL;

  const reasoned = events.filter((event) => REASONED_TYPES.has(event.type));
  const reasonedWithText = reasoned.filter((event) => {
    const reason = event.payload.reason;
    return typeof reason === 'string' && reason.trim() !== '';
  });
  let first = Infinity;
  let last = -Infinity;
  const origins = { own: 0, remix: 0, derived: 0 };
  for (const event of events) {
    const time = event.serverTs.getTime();
    if (time < first) first = time;
    if (time > last) last = time;
    origins[event.origin] += 1;
  }

  const metrics: IdentityMetrics = {
    sessions: eventCount === 0 ? 0 : countSessions(events),
    nodeEdits: events.filter((event) => event.type === 'version_save').length,
    reasonedRatio:
      reasoned.length >= IDENTITY_CONSTANTS.MIN_REASONABLE_EDITS
        ? reasonedWithText.length / reasoned.length
        : null,
    firstRecordedAt: eventCount === 0 ? null : new Date(first).toISOString(),
    lastActiveAt: eventCount === 0 ? null : new Date(last).toISOString(),
    originBreakdown: origins,
  };

  const enough = eventCount >= IDENTITY_CONSTANTS.MIN_EVENTS_FOR_AXES;
  const axes: IdentityAxes = enough
    ? {
        scaleIntensity: intensityScore(events),
        aiRelation: collaborationScore(events),
        decisionBasis: basisScore(events),
        direction: directionScore(events, setStats),
      }
    : { scaleIntensity: null, aiRelation: null, decisionBasis: null, direction: null };

  return { axes, metrics, provisional, eventCount, projectCount };
}
