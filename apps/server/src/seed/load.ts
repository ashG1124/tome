import type { Prisma } from '../generated/prisma/client';
import { SEED_CREATORS } from './creators';
import { SEED_VERIFICATION } from './nodes';
import { buildSeedPlan } from './plan';

export type SeedTx = Prisma.TransactionClient;

export interface LoadSummary {
  projects: number;
  sets: number;
  answers: number;
  events: number;
  comments: number;
}

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

/** 계정 13개(seed 5·visitor 5·persona 3)를 고정 id 로 upsert 한다. id·kind·seedOrder 는 그대로, 이름·소개만 바뀐다. */
export async function upsertSeedCreators(tx: SeedTx): Promise<number> {
  for (const creator of SEED_CREATORS) {
    const fields = {
      kind: creator.kind,
      displayName: creator.displayName,
      bio: creator.bio,
      seedOrder: creator.seedOrder,
    };
    await tx.creator.upsert({
      where: { id: creator.id },
      update: fields,
      create: { id: creator.id, ...fields },
    });
  }
  return SEED_CREATORS.length;
}

/** 핫토픽 제목을 고정 id 로 upsert 한다(seedOrder 가 같으면 같은 행). */
export async function upsertSeedTopics(tx: SeedTx): Promise<number> {
  const { topics } = buildSeedPlan();
  for (const topic of topics) {
    await tx.topic.upsert({
      where: { seedOrder: topic.seedOrder },
      update: { title: topic.title },
      create: { id: topic.id, title: topic.title, seedOrder: topic.seedOrder },
    });
  }
  return topics.length;
}

/**
 * 주어진 창작자(seed 또는 persona)의 시드 콘텐츠를 계획과 같은 값으로 되돌린다.
 * 고정 id 로 upsert 하고 계획에 없는 세트·답변·이벤트는 지우므로 여러 번 돌려도 같다(중복 0).
 * 다른 사람이 남긴 댓글·즐겨찾기·조회 이벤트는 건드리지 않는다(그 정리는 리셋이 한다).
 * 토픽(Topic) 행은 호출 전에 upsertSeedTopics 로 있어야 한다.
 */
export async function loadSeedContent(tx: SeedTx, creatorIds: string[]): Promise<LoadSummary> {
  const plan = buildSeedPlan();
  const owners = new Set(creatorIds);
  const projects = plan.projects.filter((p) => owners.has(p.ownerId));
  const projectIds = new Set(projects.map((p) => p.id));
  const sets = plan.sets.filter((s) => projectIds.has(s.projectId));
  const setIds = new Set(sets.map((s) => s.id));
  const answers = plan.answers.filter((a) => setIds.has(a.setId));
  const events = plan.events.filter((e) => owners.has(e.creatorId));
  const comments = plan.comments.filter((c) => projectIds.has(c.projectId));
  const topicRows = await tx.topic.findMany({ select: { id: true, seedOrder: true } });
  const topicBySeed = new Map(plan.topics.map((t) => [t.id, t.seedOrder]));
  const topicIdByOrder = new Map(topicRows.map((t) => [t.seedOrder, t.id]));

  // 계획에 없는 이전 행(같은 소유자)을 먼저 정리한다.
  await tx.event.deleteMany({ where: { creatorId: { in: creatorIds } } });
  const ownedProject = { project: { ownerId: { in: creatorIds } } };
  await tx.answer.deleteMany({
    where: { set: ownedProject, id: { notIn: answers.map((a) => a.id) } },
  });
  await tx.promptSet.deleteMany({
    where: { ...ownedProject, id: { notIn: sets.map((s) => s.id) } },
  });
  await tx.page.deleteMany({
    where: { ...ownedProject, id: { notIn: projects.map((p) => p.pageId) } },
  });

  for (const project of projects) {
    const topicOrder = project.topicId ? topicBySeed.get(project.topicId) : undefined;
    const fields = {
      ownerId: project.ownerId,
      kind: 'original' as const,
      title: project.title,
      status: 'finished' as const,
      finishedAt: project.finishedAt,
      postedAt: project.postedAt,
      selectionReason: project.selectionReason,
      derivedFromProjectId: null,
      derivedFromAnswerId: null,
      remixPartnerId: null,
      remixPartnerSnapshotId: null,
      topicId: topicOrder === undefined ? null : (topicIdByOrder.get(topicOrder) ?? null),
      shelfPosition: project.shelfPosition,
      lastEditedAt: project.finishedAt,
      createdAt: project.createdAt,
      deletedAt: null,
      hiddenAt: null,
    };
    await tx.project.upsert({
      where: { id: project.id },
      update: fields,
      create: { id: project.id, ...fields },
    });
    await tx.page.upsert({
      where: { id: project.pageId },
      update: { projectId: project.id, index: 0 },
      create: { id: project.pageId, projectId: project.id, index: 0 },
    });
  }

  for (const set of sets) {
    const fields = {
      projectId: set.projectId,
      pageId: set.pageId,
      position: set.position,
      prompt: set.prompt,
      presetKey: set.presetKey,
      createdAt: set.createdAt,
    };
    await tx.promptSet.upsert({
      where: { id: set.id },
      update: fields,
      create: { id: set.id, ...fields },
    });
  }

  for (const answer of answers) {
    const fields = {
      setId: answer.setId,
      status: answer.status,
      number: answer.number,
      baseAnswerId: answer.baseAnswerId,
      jobId: null,
      origin: answer.origin,
      imageKey: answer.imageKey,
      thumbKey: answer.thumbKey,
      editInputKey: null,
      imageMode: answer.imageMode,
      editInstruction: answer.editInstruction,
      assembledPrompt: answer.assembledPrompt,
      phrases: json(answer.phrases),
      excluded: json(answer.excluded),
      nodes: json(answer.nodes),
      verification: json(SEED_VERIFICATION),
      provider: 'seed',
      model: 'seed',
      isSample: false,
      sampleResultId: null,
      copiedFromAnswerId: null,
      pinned: false,
      createdById: answer.createdById,
      createdAt: answer.createdAt,
      acceptedAt: answer.status === 'accepted' ? answer.createdAt : null,
    };
    await tx.answer.upsert({
      where: { id: answer.id },
      update: fields,
      create: { id: answer.id, ...fields },
    });
  }

  for (const project of projects) {
    await tx.project.update({
      where: { id: project.id },
      data: { coverAnswerId: project.coverAnswerId },
    });
  }

  for (const stat of plan.stats.filter((s) => projectIds.has(s.projectId))) {
    const { projectId, ...counts } = stat;
    await tx.projectStat.upsert({
      where: { projectId },
      update: counts,
      create: { projectId, ...counts },
    });
  }

  for (const comment of comments) {
    const fields = {
      projectId: comment.projectId,
      authorId: comment.authorId,
      body: comment.body,
      createdAt: comment.createdAt,
      deletedAt: null,
      hiddenAt: null,
    };
    await tx.agoraComment.upsert({
      where: { id: comment.id },
      update: fields,
      create: { id: comment.id, ...fields },
    });
  }

  await tx.event.createMany({
    data: events.map((e) => ({ ...e, payload: json(e.payload) })),
    skipDuplicates: true,
  });

  return {
    projects: projects.length,
    sets: sets.length,
    answers: answers.length,
    events: events.length,
    comments: comments.length,
  };
}
