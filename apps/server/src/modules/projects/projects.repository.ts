import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ShelfItem } from './projects.rules';

export type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaService;

const SUMMARY_SELECT = {
  id: true,
  ownerId: true,
  kind: true,
  title: true,
  status: true,
  postedAt: true,
  coverAnswerId: true,
  lastEditedAt: true,
  shelfPosition: true,
  deletedAt: true,
  hiddenAt: true,
  remixPartner: { select: { id: true, kind: true, displayName: true, bio: true } },
} satisfies Prisma.ProjectSelect;

export type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof SUMMARY_SELECT }>;

/** 같은 세션·같은 멱등 키로 만든 작업이 이미 있을 때(기록은 만료로 지워진 뒤). */
export class JobKeyTakenError extends Error {}

export interface NewJobData {
  projectId: string;
  setId: string;
  sessionId: string;
  idempotencyKey: string;
}

@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 15_000, maxWait: 5_000 });
  }

  /** 소유자별 서가 순서를 한 줄로 세우는 잠금. 트랜잭션이 끝나면 풀린다. */
  async lockShelf(tx: Tx, ownerId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`shelf:${ownerId}`}))`;
  }

  listVisible(ownerId: string, limit: number): Promise<ProjectRow[]> {
    return this.prisma.project.findMany({
      where: { ownerId, deletedAt: null, hiddenAt: null },
      orderBy: [{ shelfPosition: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: SUMMARY_SELECT,
    });
  }

  findById(db: Db, id: string): Promise<ProjectRow | null> {
    return db.project.findUnique({ where: { id }, select: SUMMARY_SELECT });
  }

  /** 지워지거나 숨겨지지 않은 내 프로젝트 전부(서가 순서대로). 잠금을 잡은 뒤 부른다. */
  listShelf(tx: Tx, ownerId: string): Promise<ShelfItem[]> {
    return tx.project.findMany({
      where: { ownerId, deletedAt: null, hiddenAt: null },
      orderBy: [{ shelfPosition: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, shelfPosition: true },
    });
  }

  async creatorExists(tx: Tx, id: string): Promise<boolean> {
    return (await tx.creator.count({ where: { id } })) > 0;
  }

  async shiftShelfDown(tx: Tx, ownerId: string): Promise<void> {
    await tx.project.updateMany({
      where: { ownerId, deletedAt: null, hiddenAt: null },
      data: { shelfPosition: { increment: 1 } },
    });
  }

  async setShelfPosition(tx: Tx, id: string, shelfPosition: number): Promise<void> {
    await tx.project.update({ where: { id }, data: { shelfPosition } });
  }

  async updateTitle(tx: Tx, id: string, title: string, lastEditedAt: Date): Promise<void> {
    await tx.project.update({ where: { id }, data: { title, lastEditedAt } });
  }

  async softDelete(tx: Tx, id: string, deletedAt: Date): Promise<void> {
    await tx.project.update({ where: { id }, data: { deletedAt } });
  }

  /** 프로젝트와 첫 페이지(index 0)를 만든다. */
  createWithFirstPage(
    tx: Tx,
    data: { ownerId: string; title: string; remixPartnerId: string | null; lastEditedAt: Date },
  ): Promise<ProjectRow> {
    return tx.project.create({
      data: {
        ownerId: data.ownerId,
        kind: 'original',
        title: data.title,
        remixPartnerId: data.remixPartnerId,
        lastEditedAt: data.lastEditedAt,
        shelfPosition: 0,
        pages: { create: { index: 0 } },
      },
      select: SUMMARY_SELECT,
    });
  }

  async firstPageId(tx: Tx, projectId: string): Promise<string> {
    const page = await tx.page.findUniqueOrThrow({
      where: { projectId_index: { projectId, index: 0 } },
      select: { id: true },
    });
    return page.id;
  }

  createPromptSet(
    tx: Tx,
    data: { projectId: string; pageId: string; prompt: string; presetKey: string | null },
  ): Promise<{ id: string; position: number; prompt: string }> {
    return tx.promptSet.create({
      data: { ...data, position: 1 },
      select: { id: true, position: true, prompt: true },
    });
  }

  async createCreateJob(tx: Tx, data: NewJobData): Promise<{ id: string }> {
    try {
      return await this.insertCreateJob(tx, data);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new JobKeyTakenError();
      }
      throw error;
    }
  }

  private insertCreateJob(tx: Tx, data: NewJobData): Promise<{ id: string }> {
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
}
