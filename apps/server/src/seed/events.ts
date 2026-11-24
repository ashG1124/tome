// 합성 데이터: 아래 이벤트는 실제 사용자의 행동이 아니라, 창작자별 목표 프로필(4축)이 나오도록
// 계산식(identity-calc)의 입력 정의에 맞춰 스크립트로 만든 시드용 기록이다. 같은 입력이면 늘 같은 결과다.
import type { ProfileTarget } from './specs';
import { NODE_IDS } from './nodes';
import { seedUuid, seededRandom } from './seed-ids';

/** prompt_submit 대신 세트를 여는 서버 이벤트(예: 파생 시작) 또는 프로젝트 앞에 붙는 서버 이벤트. */
export interface ExtraEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface EventSetRef {
  id: string;
  projectId: string;
  /** 세트에서 건드릴 서로 다른 노드 수(축 D) */
  keys: number;
  presetKey: string | null;
  acceptedAnswerIds: string[];
  /** 있으면 prompt_submit 대신 이 이벤트로 세트를 연다(answerId = 첫 버전) */
  opener?: ExtraEvent;
}

export interface EventProjectRef {
  key: string;
  id: string;
  sets: EventSetRef[];
  /** 프로젝트 첫 세트 앞에 남는 서버 이벤트(예: 리믹스 상대 지정) */
  prelude?: ExtraEvent[];
  /** project_finish 를 남기는가(기본 true) */
  finish?: boolean;
  /** project_post 를 남기는가(기본 true) */
  post?: boolean;
}

export interface EventInput {
  creatorKey: string;
  creatorId: string;
  target: ProfileTarget;
  total: number;
  reasonedRatio: number;
  startDay: number;
  projects: EventProjectRef[];
}

export interface SeedEvent {
  id: string;
  schemaVersion: 1;
  type: string;
  creatorId: string;
  sessionId: null;
  projectId: string;
  setId: string | null;
  answerId: string | null;
  payload: Record<string, unknown>;
  clientTs: Date | null;
  serverTs: Date;
  source: 'client' | 'server';
}

export interface ProjectTimes {
  first: Date;
  last: Date;
  finished: Date | null;
  posted: Date | null;
}

export interface GeneratedEvents {
  events: SeedEvent[];
  /** 프로젝트 id → 첫·마지막 이벤트, 완료·게시 시각(그 이벤트가 없으면 null) */
  projectTimes: Map<string, ProjectTimes>;
  /** 세트 id → 첫 이벤트 시각 */
  setTimes: Map<string, Date>;
  /** 답변 id → 그 답변이 처음 보인 시각 */
  answerTimes: Map<string, Date>;
}

const BASE_TIME = Date.UTC(2026, 9, 26, 1, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSIONS = 5;
const REASONS = [
  'Matches the mood I wanted',
  'Keeps the main subject clear',
  'Follows the style I had in mind',
  'Balances light and detail',
  'A better fit for the audience',
  'Simpler and easier to read',
];
const NOISE_TYPES = ['node_close', 'version_nav', 'verify_toggle'] as const;

/** n 칸 중 k 칸을 고르게 true 로 둔다. */
function spread(n: number, k: number): boolean[] {
  return Array.from(
    { length: n },
    (_, i) => Math.floor(((i + 1) * k) / n) - Math.floor((i * k) / n) > 0,
  );
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

interface Manip {
  channel: 'A' | 'B' | 'C';
  type: string;
  /** C 채널: 건드릴 노드의 성향. 그 밖은 null(아무 노드나) */
  domain: 'evidence' | 'intuitive' | null;
  payload: Record<string, unknown>;
  /** 이유 문자열을 남길 수 있는 종류인가 */
  reasonable: boolean;
}

function buildManips(
  input: EventInput,
  rng: () => number,
  counts: { a: number; b: number; c: number },
): Manip[] {
  const { target } = input;
  const mu = clamp01(target.A / 200 + 0.5);
  const weightCandidates = Array.from({ length: 10 }, (_, d) => d / 9);
  const padCandidates: number[] = [];
  for (let dx = 0; dx <= 10; dx += 1) {
    for (let dy = 0; dy <= 10; dy += 1) padCandidates.push(Math.hypot(dx, dy) / Math.sqrt(200));
  }
  // A: weight_dial_click 와 meaning_point_set 의 값 변화 크기(0~1)를 오차 확산으로 고른다.
  const intensities: number[] = [];
  const kinds: ('weight' | 'pad')[] = [];
  let sum = 0;
  for (let j = 0; j < counts.a; j += 1) {
    const kind = j % 3 === 2 ? 'pad' : 'weight';
    const goal = mu * (j + 1) - sum;
    const pool = kind === 'weight' ? weightCandidates : padCandidates;
    let best = pool[0]!;
    for (const c of pool) if (Math.abs(c - goal) < Math.abs(best - goal)) best = c;
    intensities.push(best);
    kinds.push(kind);
    sum += best;
  }
  const manipsA: Manip[] = intensities.map((value, j) => {
    if (kinds[j] === 'weight') {
      const d = Math.round(value * 9);
      const up = rng() < 0.5;
      const ai = up ? Math.floor(rng() * (10 - d)) : d + Math.floor(rng() * (10 - d));
      return {
        channel: 'A',
        type: 'weight_dial_click',
        domain: null,
        payload: { weightAi: ai, weightFinal: up ? ai + d : ai - d },
        reasonable: false,
      };
    }
    // 패드: 변화 (dx, dy) 중 거리가 목표에 가장 가까운 것
    let bx = 0;
    let by = 0;
    let bestGap = Infinity;
    for (let dx = 0; dx <= 10; dx += 1) {
      for (let dy = 0; dy <= 10; dy += 1) {
        const gap = Math.abs(Math.hypot(dx, dy) / Math.sqrt(200) - value);
        if (gap < bestGap) {
          bestGap = gap;
          bx = dx;
          by = dy;
        }
      }
    }
    const sign = j % 2 === 0 ? 1 : -1;
    return {
      channel: 'A',
      type: 'meaning_point_set',
      domain: null,
      payload: {
        padAi: { x: -5 * sign, y: -5 * sign },
        padFinal: { x: -5 * sign + bx * sign, y: -5 * sign + by * sign },
      },
      reasonable: false,
    };
  });

  const leadCount = Math.round((counts.b * (1 + target.B / 100)) / 2);
  const leadFlags = spread(counts.b, leadCount);
  const manipsB: Manip[] = leadFlags.map((lead) => ({
    channel: 'B',
    type: 'flag_decision',
    domain: null,
    payload: { state: lead ? 'kept' : 'removed' },
    reasonable: true,
  }));

  const evidenceCount = Math.round((counts.c * (1 + target.C / 100)) / 2);
  const evidenceFlags = spread(counts.c, evidenceCount);
  const cTypes = ['node_open', 'weight_apply', 'source_apply', 'evidence_toggle'] as const;
  const manipsC: Manip[] = evidenceFlags.map((isEvidence, j) => {
    const type = cTypes[j % cTypes.length]!;
    const payload: Record<string, unknown> = {};
    if (type === 'weight_apply') {
      const ai = Math.floor(rng() * 8);
      payload.weightAi = ai;
      payload.weightFinal = ai + 1 + Math.floor(rng() * (9 - ai));
    }
    if (type === 'evidence_toggle') payload.enabled = j % 8 !== 3;
    return {
      channel: 'C',
      type,
      domain: isEvidence ? 'evidence' : 'intuitive',
      payload,
      reasonable: type === 'weight_apply' || type === 'source_apply',
    };
  });

  // 세 채널을 고르게 섞는다.
  const tagged = [
    ...manipsA.map((m, i) => ({ m, key: (i + 0.25) / manipsA.length })),
    ...manipsB.map((m, i) => ({ m, key: (i + 0.5) / manipsB.length })),
    ...manipsC.map((m, i) => ({ m, key: (i + 0.75) / manipsC.length })),
  ];
  tagged.sort((x, y) => x.key - y.key);
  return tagged.map((t) => t.m);
}

/** 세트에서 건드릴 노드 K 개. 두 성향을 번갈아 고른다(목표 C 가 + 면 근거 쪽부터). */
function poolFor(keys: number, evidenceFirst: boolean): string[] {
  const first = evidenceFirst ? NODE_IDS.evidence : NODE_IDS.intuitive;
  const second = evidenceFirst ? NODE_IDS.intuitive : NODE_IDS.evidence;
  const out: string[] = [];
  for (let i = 0; out.length < keys; i += 1) {
    if (i % 2 === 0 && first[i / 2]) out.push(first[i / 2]!);
    else if (i % 2 === 1 && second[(i - 1) / 2]) out.push(second[(i - 1) / 2]!);
    if (i > 40) break;
  }
  return out;
}

const domainOfId = (id: string): 'evidence' | 'intuitive' =>
  'dse'.includes(id[0]!) ? 'evidence' : 'intuitive';

export function generateEvents(input: EventInput): GeneratedEvents {
  const rng = seededRandom(`events:${input.creatorKey}`);
  const sets = input.projects.flatMap((p) => p.sets);
  const total = input.total;
  const counts = {
    a: Math.round(total * 0.24),
    b: 2 * Math.round((total * 0.2) / 2),
    c: 2 * Math.round((total * 0.24) / 2),
  };
  const manips = buildManips(input, rng, counts);

  // 이유 문자열: 이유를 남길 수 있는 종류 중 목표 비율만큼 고르게.
  const reasonableIdx = manips.map((m, i) => (m.reasonable ? i : -1)).filter((i) => i >= 0);
  const withReason = new Set<number>();
  spread(reasonableIdx.length, Math.round(reasonableIdx.length * input.reasonedRatio)).forEach(
    (on, n) => {
      if (on) withReason.add(reasonableIdx[n]!);
    },
  );

  // 세트마다 조작을 순서대로 나눠 받는다.
  const perSet = sets.map(
    (_, i) =>
      Math.floor(((i + 1) * manips.length) / sets.length) -
      Math.floor((i * manips.length) / sets.length),
  );
  const structural =
    sets.length * 1 +
    sets.reduce((n, set) => n + set.acceptedAnswerIds.length * 2 - 1, 0) +
    input.projects.reduce(
      (n, p) =>
        n + (p.prelude?.length ?? 0) + (p.finish === false ? 0 : 1) + (p.post === false ? 0 : 1),
      0,
    );
  const noiseTotal = Math.max(0, total - manips.length - structural);
  const noisePerSet = sets.map(
    (_, i) =>
      Math.floor(((i + 1) * noiseTotal) / sets.length) - Math.floor((i * noiseTotal) / sets.length),
  );

  type Item = Omit<
    SeedEvent,
    'id' | 'serverTs' | 'clientTs' | 'creatorId' | 'sessionId' | 'schemaVersion'
  > & {
    projectKey: string;
    projectEnd?: 'finish' | 'post';
  };
  const items: Item[] = [];
  let manipCursor = 0;
  let reasonCursor = 0;
  let setIndex = 0;
  const evidenceFirst = input.target.C >= 0;
  for (const project of input.projects) {
    for (const extra of project.prelude ?? []) {
      items.push({
        projectKey: project.key,
        projectId: project.id,
        setId: null,
        type: extra.type,
        answerId: null,
        payload: extra.payload,
        source: 'server',
      });
    }
    for (const set of project.sets) {
      const pool = poolFor(set.keys, evidenceFirst);
      const poolEvidence = pool.filter((id) => domainOfId(id) === 'evidence');
      const poolIntuitive = pool.filter((id) => domainOfId(id) === 'intuitive');
      let neutralPtr = 0;
      let evidencePtr = 0;
      let intuitivePtr = 0;
      const base = { projectKey: project.key, projectId: project.id, setId: set.id };
      items.push(
        set.opener
          ? {
              ...base,
              type: set.opener.type,
              answerId: set.acceptedAnswerIds[0] ?? null,
              payload: set.opener.payload,
              source: 'server',
            }
          : {
              ...base,
              type: 'prompt_submit',
              answerId: null,
              payload: {
                ...(set.presetKey ? { presetKey: set.presetKey } : {}),
                hasAttachment: false,
              },
              source: 'client',
            },
      );
      const mine = manips.slice(manipCursor, manipCursor + perSet[setIndex]!);
      const myIdx = mine.map((_, i) => manipCursor + i);
      manipCursor += perSet[setIndex]!;
      const versions = set.acceptedAnswerIds.length;
      let noiseLeft = noisePerSet[setIndex]!;
      set.acceptedAnswerIds.forEach((answerId, v) => {
        items.push({ ...base, type: 'canvas_revealed', answerId, payload: {}, source: 'client' });
        if (v >= 1)
          items.push({ ...base, type: 'version_save', answerId, payload: {}, source: 'server' });
        const from = Math.floor((v * mine.length) / versions);
        const to = Math.floor(((v + 1) * mine.length) / versions);
        for (let i = from; i < to; i += 1) {
          const m = mine[i]!;
          let nodeId: string;
          if (m.domain === 'evidence' && poolEvidence.length > 0) {
            nodeId = poolEvidence[evidencePtr % poolEvidence.length]!;
            evidencePtr += 1;
          } else if (m.domain === 'intuitive' && poolIntuitive.length > 0) {
            nodeId = poolIntuitive[intuitivePtr % poolIntuitive.length]!;
            intuitivePtr += 1;
          } else {
            nodeId = pool[neutralPtr % pool.length]!;
            neutralPtr += 1;
          }
          const payload: Record<string, unknown> = { nodeId, ...m.payload };
          if (withReason.has(myIdx[i]!)) {
            payload.reason = REASONS[reasonCursor % REASONS.length];
            reasonCursor += 1;
          } else if (m.reasonable) {
            payload.reason = '';
          }
          items.push({ ...base, type: m.type, answerId, payload, source: 'client' });
        }
        const share =
          Math.floor(((v + 1) * noisePerSet[setIndex]!) / versions) -
          Math.floor((v * noisePerSet[setIndex]!) / versions);
        for (let n = 0; n < share && noiseLeft > 0; n += 1, noiseLeft -= 1) {
          items.push({
            ...base,
            type: NOISE_TYPES[(items.length + n) % NOISE_TYPES.length]!,
            answerId,
            payload: {},
            source: 'client',
          });
        }
      });
      setIndex += 1;
    }
    if (project.finish !== false) {
      items.push({
        projectKey: project.key,
        projectId: project.id,
        setId: null,
        type: 'project_finish',
        answerId: null,
        payload: {},
        source: 'server',
        projectEnd: 'finish',
      });
    }
    if (project.post !== false) {
      items.push({
        projectKey: project.key,
        projectId: project.id,
        setId: null,
        type: 'project_post',
        answerId: null,
        payload: {},
        source: 'server',
        projectEnd: 'post',
      });
    }
  }

  // 시각: 작업 세션 SESSIONS 개로 나누고, 세션 사이는 하루, 세션 안은 1~2분 간격.
  const perBlock = Math.ceil(items.length / SESSIONS);
  const events: SeedEvent[] = [];
  const projectTimes = new Map<string, ProjectTimes>();
  const setTimes = new Map<string, Date>();
  const answerTimes = new Map<string, Date>();
  items.forEach((item, index) => {
    const block = Math.floor(index / perBlock);
    const within = index % perBlock;
    const serverTs = new Date(
      BASE_TIME + (input.startDay + block) * DAY_MS + within * 90_000 + ((index * 37) % 60) * 1000,
    );
    const { projectKey, projectEnd, ...row } = item;
    void projectKey;
    events.push({
      ...row,
      id: seedUuid(`event:${input.creatorKey}:${index}`),
      schemaVersion: 1,
      creatorId: input.creatorId,
      sessionId: null,
      clientTs: item.source === 'client' ? new Date(serverTs.getTime() - 120) : null,
      serverTs,
    });
    const times = projectTimes.get(item.projectId) ?? {
      first: serverTs,
      last: serverTs,
      finished: null,
      posted: null,
    };
    times.last = serverTs;
    if (projectEnd === 'finish') times.finished = serverTs;
    if (projectEnd === 'post') times.posted = serverTs;
    projectTimes.set(item.projectId, times);
    if (item.setId && !setTimes.has(item.setId)) setTimes.set(item.setId, serverTs);
    if (item.answerId && !answerTimes.has(item.answerId)) answerTimes.set(item.answerId, serverTs);
  });
  return { events, projectTimes, setTimes, answerTimes };
}
