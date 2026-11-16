import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type Tx = Prisma.TransactionClient;
export type Db = Tx | PrismaService;

export const ACTIVE_JOB_STATUSES = ['pending', 'running'] as const;

/** 같은 (jobId, stage) 를 동시에 만들려 하거나 이미 있는 값과 겹칠 때. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** 유니크가 아닌 DB 제약(CHECK 등) 위반인지. */
export function isCheckViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2004') return true;
  const message = error instanceof Error ? error.message : '';
  return message.includes('check constraint') || message.includes('23514');
}

const PROJECT_ACCESS_SELECT = {
  id: true,
  ownerId: true,
  postedAt: true,
  deletedAt: true,
  hiddenAt: true,
} satisfies Prisma.ProjectSelect;
export type ProjectAccessRow = Prisma.ProjectGetPayload<{ select: typeof PROJECT_ACCESS_SELECT }>;

const ANSWER_ARGS = { include: { set: { select: { projectId: true } } } } as const;
export type AnswerRow = Prisma.AnswerGetPayload<typeof ANSWER_ARGS>;

const JOB_ARGS = {
  include: {
    steps: true,
    project: { select: PROJECT_ACCESS_SELECT },
    set: { select: { prompt: true } },
  },
} as const;
export type JobRow = Prisma.GenerationJobGetPayload<typeof JOB_ARGS>;
export type StepRow = JobRow['steps'][number];

export type JobWithSteps = Prisma.GenerationJobGetPayload<{ include: { steps: true } }>;

export interface ClaimResult {
  kind: 'claimed' | 'succeeded' | 'busy';
  attempt?: number;
  step?: StepRow;
  retryAfterMs?: number;
}

@Injectable()
export class GenerationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 트랜잭션 밖 읽기용 클라이언트. */
  get client(): PrismaService {
    return this.prisma;
  }

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 15_000, maxWait: 5_000 });
  }

  // ---- 프로젝트 ----

  findProject(db: Db, id: string): Promise<ProjectAccessRow | null> {
    return db.project.findUnique({ where: { id }, select: PROJECT_ACCESS_SELECT });
  }

  /** 프로젝트 행을 잠가 같은 프로젝트의 쓰기를 한 줄로 세운다(트랜잭션이 끝나면 풀린다). */
  async lockProject(tx: Tx, id: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${id}::uuid FOR UPDATE`;
  }

  async touchProject(tx: Tx, id: string, lastEditedAt: Date): Promise<void> {
    await tx.project.update({ where: { id }, data: { lastEditedAt } });
  }

  // ---- 페이지 ----

  listPages(db: Db, projectId: string) {
    return db.page.findMany({
      where: { projectId },
      orderBy: { index: 'asc' },
      select: { id: true, index: true, _count: { select: { sets: true } } },
    });
  }

  async maxPageIndex(tx: Tx, projectId: string): Promise<number | null> {
    const result = await tx.page.aggregate({ where: { projectId }, _max: { index: true } });
    return result._max.index;
  }

  createPage(tx: Tx, projectId: string, index: number): Promise<{ id: string; index: number }> {
    return tx.page.create({ data: { projectId, index }, select: { id: true, index: true } });
  }

  async pageBelongsToProject(db: Db, projectId: string, pageId: string): Promise<boolean> {
    return (await db.page.count({ where: { id: pageId, projectId } })) > 0;
  }

  // ---- 세트 ----

  countSets(tx: Tx, pageId: string): Promise<number> {
    return tx.promptSet.count({ where: { pageId } });
  }

  createSet(
    tx: Tx,
    data: {
      projectId: string;
      pageId: string;
      position: number;
      prompt: string;
      presetKey: string | null;
    },
  ): Promise<{ id: string; position: number; prompt: string }> {
    return tx.promptSet.create({
      data,
      select: { id: true, position: true, prompt: true },
    });
  }

  listSetsWithAnswers(db: Db, pageId: string) {
    return db.promptSet.findMany({
      where: { pageId },
      orderBy: { position: 'asc' },
      include: { answers: { where: { status: 'accepted' }, orderBy: { number: 'asc' } } },
    });
  }

  // ---- job ----

  hasActiveJob(tx: Tx, projectId: string): Promise<boolean> {
    return tx.generationJob
      .count({ where: { projectId, status: { in: [...ACTIVE_JOB_STATUSES] } } })
      .then((n) => n > 0);
  }

  async jobKeyExists(tx: Tx, sessionId: string, key: string): Promise<boolean> {
    return (
      (await tx.generationJob.count({
        where: { createdBySessionId: sessionId, idempotencyKey: key },
      })) > 0
    );
  }

  createCreateJob(
    tx: Tx,
    data: { projectId: string; setId: string; sessionId: string; idempotencyKey: string },
  ): Promise<{ id: string }> {
    return tx.generationJob.create({
      data: {
        projectId: data.projectId,
        setId: data.setId,
        kind: 'create',
        startStage: 'analyze',
        nextStage: 'analyze',
        status: 'pending',
        appliedConnectionIds: [],
        idempotencyKey: data.idempotencyKey,
        createdBySessionId: data.sessionId,
      },
      select: { id: true },
    });
  }

  findJob(db: Db, id: string): Promise<JobRow | null> {
    return db.generationJob.findUnique({ where: { id }, ...JOB_ARGS });
  }

  findActiveJob(db: Db, projectId: string): Promise<JobWithSteps | null> {
    return db.generationJob.findFirst({
      where: { projectId, status: { in: [...ACTIVE_JOB_STATUSES] } },
      include: { steps: true },
    });
  }

  findJobWithSteps(db: Db, id: string): Promise<JobWithSteps | null> {
    return db.generationJob.findUnique({ where: { id }, include: { steps: true } });
  }

  /** 진행 중(pending·running)일 때만 취소한다. 바뀐 행 수를 돌려준다. */
  async cancelJob(id: string, now: Date): Promise<number> {
    const result = await this.prisma.generationJob.updateMany({
      where: { id, status: { in: [...ACTIVE_JOB_STATUSES] } },
      data: { status: 'cancelled', finishedAt: now },
    });
    return result.count;
  }

  async markJobRunning(id: string): Promise<void> {
    await this.prisma.generationJob.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'running' },
    });
  }

  // ---- 단계 ----

  /**
   * 단계를 원자적으로 잡는다. 없으면 INSERT, 있으면 "실행 중이 아니거나 lease 가 지난" 때만 UPDATE.
   * 잡지 못하면 이미 끝난 단계(succeeded)인지, 다른 요청이 실행 중(busy)인지 알려 준다.
   */
  async claimStep(jobId: string, stage: string, now: Date, leaseUntil: Date): Promise<ClaimResult> {
    const claimed = await this.prisma.jobStep.updateMany({
      where: {
        jobId,
        stage,
        status: { not: 'succeeded' },
        OR: [{ status: { not: 'running' } }, { leaseUntil: { lt: now } }],
      },
      data: {
        status: 'running',
        attempt: { increment: 1 },
        leaseUntil,
        startedAt: now,
        finishedAt: null,
        errorCode: null,
      },
    });
    if (claimed.count === 1) {
      const step = await this.prisma.jobStep.findUniqueOrThrow({
        where: { jobId_stage: { jobId, stage } },
      });
      return { kind: 'claimed', attempt: step.attempt };
    }
    try {
      await this.prisma.jobStep.create({
        data: { jobId, stage, status: 'running', attempt: 1, leaseUntil, startedAt: now },
      });
      return { kind: 'claimed', attempt: 1 };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const step = await this.prisma.jobStep.findUniqueOrThrow({
      where: { jobId_stage: { jobId, stage } },
    });
    if (step.status === 'succeeded') return { kind: 'succeeded', step };
    const retryAfterMs = Math.max(0, (step.leaseUntil?.getTime() ?? now.getTime()) - now.getTime());
    return { kind: 'busy', retryAfterMs };
  }

  async failStep(
    jobId: string,
    stage: string,
    errorCode: string,
    now: Date,
    latencyMs: number,
  ): Promise<void> {
    await this.prisma.jobStep.updateMany({
      where: { jobId, stage, status: 'running' },
      data: { status: 'failed', errorCode, leaseUntil: null, finishedAt: now, latencyMs },
    });
  }

  /** 같은 단계가 상한만큼 실패했을 때 job 을 failed 로 닫는다(이미 닫힌 job 은 그대로). */
  async failJob(jobId: string, errorCode: string, now: Date): Promise<void> {
    await this.prisma.generationJob.updateMany({
      where: { id: jobId, status: { in: [...ACTIVE_JOB_STATUSES] } },
      data: { status: 'failed', errorCode, finishedAt: now },
    });
  }

  /** 단계 성공 저장. job 이 그 사이 취소됐으면 job 은 건드리지 않는다. 취소되지 않았으면 true. */
  async completeStep(
    tx: Tx,
    data: {
      jobId: string;
      stage: string;
      output: Prisma.InputJsonValue;
      provider: string | null;
      model: string | null;
      fallbackUsed: boolean;
      neuronsEst: number | null;
      latencyMs: number;
      now: Date;
      nextStage: string | null;
      resultAnswerId?: string;
    },
  ): Promise<boolean> {
    await tx.jobStep.update({
      where: { jobId_stage: { jobId: data.jobId, stage: data.stage } },
      data: {
        status: 'succeeded',
        output: data.output,
        provider: data.provider,
        model: data.model,
        fallbackUsed: data.fallbackUsed,
        neuronsEst: data.neuronsEst,
        latencyMs: data.latencyMs,
        finishedAt: data.now,
        leaseUntil: null,
        errorCode: null,
      },
    });
    const jobData: Prisma.GenerationJobUpdateManyMutationInput & {
      nextStage: string | null;
      resultAnswerId?: string;
    } = { nextStage: data.nextStage };
    if (data.resultAnswerId !== undefined) jobData.resultAnswerId = data.resultAnswerId;
    if (data.nextStage === null) {
      jobData.status = 'succeeded';
      jobData.finishedAt = data.now;
    } else {
      jobData.status = 'running';
    }
    const updated = await tx.generationJob.updateMany({
      where: { id: data.jobId, status: { in: [...ACTIVE_JOB_STATUSES] } },
      data: jobData,
    });
    return updated.count === 1;
  }

  // ---- 답변 ----

  async maxAcceptedNumber(tx: Tx, setId: string): Promise<number> {
    const result = await tx.answer.aggregate({
      where: { setId, status: 'accepted' },
      _max: { number: true },
    });
    return result._max.number ?? 0;
  }

  createAnswer(tx: Tx, data: Prisma.AnswerUncheckedCreateInput): Promise<AnswerRow> {
    return tx.answer.create({ data, ...ANSWER_ARGS });
  }

  async setAnswerVerification(
    tx: Tx,
    answerId: string,
    verification: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.answer.update({ where: { id: answerId }, data: { verification } });
  }

  findAnswer(db: Db, id: string): Promise<AnswerRow | null> {
    return db.answer.findUnique({ where: { id }, ...ANSWER_ARGS });
  }
}
