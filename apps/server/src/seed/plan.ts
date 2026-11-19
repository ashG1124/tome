// 시드 콘텐츠 전체 계획(DB 없이 만든다). 적재(load.ts)와 검증(테스트)이 같은 계획을 쓴다.
import { answerImageKey } from '../storage/object-storage';
import { SEED_CREATORS } from './creators';
import { generateEvents, type SeedEvent } from './events';
import { assembleFor, buildNodes } from './nodes';
import { seedUuid } from './seed-ids';
import {
  CREATOR_SPECS,
  initialStat,
  SEED_COMMENTS,
  TOPICS,
  type CreatorSpec,
  type ProjectSpec,
} from './specs';

export interface PlanProject {
  key: string;
  id: string;
  ownerId: string;
  ownerKind: 'seed' | 'persona';
  title: string;
  finishedAt: Date;
  postedAt: Date;
  createdAt: Date;
  coverAnswerId: string;
  selectionReason: string;
  topicId: string | null;
  shelfPosition: number;
  pageId: string;
  spec: ProjectSpec;
}

export interface PlanSet {
  id: string;
  projectId: string;
  pageId: string;
  position: number;
  prompt: string;
  presetKey: string | null;
  createdAt: Date;
}

export interface PlanAnswer {
  id: string;
  setId: string;
  projectKey: string;
  status: 'accepted' | 'discarded';
  number: number | null;
  baseAnswerId: string | null;
  origin: 'seed' | 'edited';
  imageMode: 'generate' | 'edit';
  editInstruction: string | null;
  imageKey: string;
  thumbKey: string;
  assembledPrompt: string;
  phrases: Record<string, string>;
  excluded: { id: string; reason: string }[];
  nodes: ReturnType<typeof buildNodes>;
  createdById: string;
  createdAt: Date;
}

export interface PlanComment {
  id: string;
  projectId: string;
  authorId: string;
  body: string;
  createdAt: Date;
}

export interface PlanCreator {
  key: string;
  id: string;
  spec: CreatorSpec;
}

export interface SeedPlan {
  topics: { id: string; title: string; seedOrder: number }[];
  creators: PlanCreator[];
  projects: PlanProject[];
  sets: PlanSet[];
  answers: PlanAnswer[];
  events: SeedEvent[];
  comments: PlanComment[];
  stats: {
    projectId: string;
    viewCount: number;
    remixCount: number;
    deriveCount: number;
    likeCount: number;
  }[];
}

const EDIT_INSTRUCTIONS = [
  'Make the main subject slightly bolder',
  'Soften the background colors',
  'Shift the light a little warmer',
];

const DAY_MS = 24 * 60 * 60 * 1000;

function creatorIdOf(spec: CreatorSpec): string {
  const found = SEED_CREATORS.filter((c) => c.kind === spec.kind);
  const pick =
    spec.kind === 'seed' ? found.find((c) => c.seedOrder === spec.order) : found[spec.order - 1];
  if (!pick) throw new Error(`No creator for ${spec.kind} ${spec.order}`);
  return pick.id;
}

/** 이 계획이 만드는 답변 이미지 객체 키(리셋이 지우지 않는 키). */
export const answerKeysOf = (answerId: string): string[] => [
  answerImageKey(answerId, 'full', 'image/jpeg'),
  answerImageKey(answerId, 'thumb'),
];

let cached: SeedPlan | null = null;

export function buildSeedPlan(): SeedPlan {
  if (cached) return cached;
  const topics = TOPICS.map((t, i) => ({
    id: seedUuid(`topic:${t.key}`),
    title: t.title,
    seedOrder: i + 1,
  }));
  const topicId = new Map(TOPICS.map((t, i) => [t.key, topics[i]!.id]));
  const plan: SeedPlan = {
    topics,
    creators: [],
    projects: [],
    sets: [],
    answers: [],
    events: [],
    comments: [],
    stats: [],
  };
  const seedIdByOrder = new Map<number, string>();
  let projectIndex = 0;

  for (const spec of CREATOR_SPECS) {
    const creatorId = creatorIdOf(spec);
    const creatorKey = `${spec.kind}-${spec.order}`;
    if (spec.kind === 'seed') seedIdByOrder.set(spec.order, creatorId);
    plan.creators.push({ key: creatorKey, id: creatorId, spec });

    // 1) 구조(id)부터 정한다.
    const refs = spec.projects.map((p) => {
      const projectId = seedUuid(`project:${p.key}`);
      return {
        spec: p,
        id: projectId,
        pageId: seedUuid(`page:${p.key}`),
        sets: p.sets.map((setSpec, n) => ({
          spec: setSpec,
          id: seedUuid(`set:${p.key}:${n + 1}`),
          position: n + 1,
          acceptedIds: Array.from({ length: setSpec.versions }, (_, v) =>
            seedUuid(`answer:${p.key}:${n + 1}:${v + 1}`),
          ),
          discardedIds: Array.from({ length: setSpec.discarded }, (_, d) =>
            seedUuid(`answer:${p.key}:${n + 1}:x${d + 1}`),
          ),
        })),
      };
    });

    // 2) 이벤트를 만든다(시각이 나온다).
    const generated = generateEvents({
      creatorKey,
      creatorId,
      target: spec.target,
      total: spec.eventTotal,
      reasonedRatio: spec.reasonedRatio,
      startDay: spec.startDay,
      projects: refs.map((r) => ({
        key: r.spec.key,
        id: r.id,
        sets: r.sets.map((set, n) => ({
          id: set.id,
          projectId: r.id,
          keys: set.spec.keys,
          presetKey: n === 0 ? (r.spec.presetKey ?? null) : null,
          acceptedAnswerIds: set.acceptedIds,
        })),
      })),
    });
    plan.events.push(...generated.events);

    // 3) 프로젝트·세트·답변 행.
    refs.forEach((r, shelf) => {
      const times = generated.projectTimes.get(r.id)!;
      const libraryIndex = projectIndex;
      const firstSet = r.sets[0]!;
      const coverAnswerId = firstSet.acceptedIds[firstSet.acceptedIds.length - 1]!;
      plan.projects.push({
        key: r.spec.key,
        id: r.id,
        ownerId: creatorId,
        ownerKind: spec.kind,
        title: r.spec.title,
        finishedAt: times.finished,
        postedAt: times.posted,
        createdAt: times.first,
        coverAnswerId,
        selectionReason: `Chosen for the clearest balance of ${r.spec.keywords[0]} and ${r.spec.attributes[0]}.`,
        topicId: r.spec.topic ? (topicId.get(r.spec.topic) ?? null) : null,
        shelfPosition: shelf,
        pageId: r.pageId,
        spec: r.spec,
      });
      plan.stats.push({ projectId: r.id, ...initialStat(projectIndex, spec.kind) });
      projectIndex += 1;

      r.sets.forEach((set, n) => {
        const setTime = generated.setTimes.get(set.id)!;
        plan.sets.push({
          id: set.id,
          projectId: r.id,
          pageId: r.pageId,
          position: set.position,
          prompt:
            n === 0 ? r.spec.prompt : `${r.spec.prompt.replace(/\.$/, '')}, alternate composition`,
          presetKey: n === 0 ? (r.spec.presetKey ?? null) : null,
          createdAt: setTime,
        });
        const common = (answerId: string, version: number) => {
          const nodes = buildNodes(r.spec, libraryIndex, version);
          const assembled = assembleFor(nodes);
          return {
            id: answerId,
            setId: set.id,
            projectKey: r.spec.key,
            imageKey: answerImageKey(answerId, 'full', 'image/jpeg'),
            thumbKey: answerImageKey(answerId, 'thumb'),
            assembledPrompt: assembled.assembledPrompt,
            phrases: assembled.phrases,
            excluded: assembled.excluded,
            nodes,
            createdById: creatorId,
          };
        };
        set.acceptedIds.forEach((answerId, v) => {
          plan.answers.push({
            ...common(answerId, v),
            status: 'accepted',
            number: v + 1,
            baseAnswerId: v === 0 ? null : set.acceptedIds[v - 1]!,
            origin: v === 0 ? 'seed' : 'edited',
            imageMode: v === 0 ? 'generate' : 'edit',
            editInstruction:
              v === 0 ? null : EDIT_INSTRUCTIONS[(v - 1) % EDIT_INSTRUCTIONS.length]!,
            createdAt: generated.answerTimes.get(answerId) ?? setTime,
          });
        });
        set.discardedIds.forEach((answerId, d) => {
          plan.answers.push({
            ...common(answerId, 0),
            status: 'discarded',
            number: null,
            baseAnswerId: null,
            origin: 'seed',
            imageMode: 'generate',
            editInstruction: null,
            createdAt: new Date(setTime.getTime() + (d + 1) * 5_000),
          });
        });
      });
    });
  }

  SEED_COMMENTS.forEach((c, i) => {
    const project = plan.projects.find((p) => p.key === c.project)!;
    plan.comments.push({
      id: seedUuid(`comment:${i}`),
      projectId: project.id,
      authorId: seedIdByOrder.get(c.authorOrder)!,
      body: c.body,
      createdAt: new Date(project.postedAt.getTime() + DAY_MS + i * 3_600_000),
    });
  });

  cached = plan;
  return plan;
}

/** 시드 상태의 답변 id 전부(리셋이 이 답변의 이미지 객체는 지우지 않는다). */
export const seedAnswerIds = (): Set<string> => new Set(buildSeedPlan().answers.map((a) => a.id));
