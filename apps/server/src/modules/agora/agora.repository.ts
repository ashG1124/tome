import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type Tx = Prisma.TransactionClient;
export type Db = Tx | PrismaService;

/** 공개 대상: 게시 중이고 삭제·숨김이 아닌 프로젝트. */
export const PUBLIC_PROJECT_WHERE = {
  postedAt: { not: null },
  deletedAt: null,
  hiddenAt: null,
} satisfies Prisma.ProjectWhereInput;

const CREATOR_SELECT = {
  id: true,
  kind: true,
  displayName: true,
  bio: true,
  avatarKey: true,
  seedOrder: true,
} satisfies Prisma.CreatorSelect;

const CARD_SELECT = {
  id: true,
  title: true,
  kind: true,
  postedAt: true,
  finishedAt: true,
  deletedAt: true,
  hiddenAt: true,
  coverAnswerId: true,
  topicId: true,
  owner: { select: CREATOR_SELECT },
  stat: true,
} satisfies Prisma.ProjectSelect;
export type CardRow = Prisma.ProjectGetPayload<{ select: typeof CARD_SELECT }>;

const DETAIL_SELECT = {
  ...CARD_SELECT,
  selectionReason: true,
  derivedFromProjectId: true,
  derivedFromAnswerId: true,
  derivedFrom: {
    select: { id: true, title: true, postedAt: true, deletedAt: true, hiddenAt: true },
  },
} satisfies Prisma.ProjectSelect;
export type DetailRow = Prisma.ProjectGetPayload<{ select: typeof DETAIL_SELECT }>;

const COMMENT_ARGS = { include: { author: true } } as const;
export type AgoraCommentRow = Prisma.AgoraCommentGetPayload<typeof COMMENT_ARGS>;

export type StatField = 'viewCount' | 'deriveCount';

@Injectable()
export class AgoraRepository {
  constructor(private readonly prisma: PrismaService) {}

  get client(): PrismaService {
    return this.prisma;
  }

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 15_000, maxWait: 5_000 });
  }

  /** 공개 프로젝트(데모 규모라 메모리에서 순위를 매긴다). */
  listPublic(db: Db, extra: Prisma.ProjectWhereInput = {}): Promise<CardRow[]> {
    return db.project.findMany({
      where: { ...PUBLIC_PROJECT_WHERE, ...extra },
      select: CARD_SELECT,
    });
  }

  listTopics(db: Db) {
    return db.topic.findMany({ orderBy: { seedOrder: 'asc' } });
  }

  findTopic(db: Db, id: string) {
    return db.topic.findUnique({ where: { id } });
  }

  /** 삭제·숨김이 아닌 댓글 수(프로젝트별). */
  async commentCounts(db: Db, projectIds: string[]): Promise<Map<string, number>> {
    if (projectIds.length === 0) return new Map();
    const groups = await db.agoraComment.groupBy({
      by: ['projectId'],
      where: { projectId: { in: projectIds }, deletedAt: null, hiddenAt: null },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.projectId, g._count._all]));
  }

  /** 삭제·숨김 여부와 상관없이 프로젝트 한 건(공개 판정은 service 가 한다). */
  findDetail(db: Db, id: string): Promise<DetailRow | null> {
    return db.project.findUnique({ where: { id }, select: DETAIL_SELECT });
  }

  /** 대표 답변이 속한 세트와 그 확정 답변(번호 순). */
  findSetOfAnswer(db: Db, answerId: string) {
    return db.promptSet.findFirst({
      where: { answers: { some: { id: answerId } } },
      include: { answers: { where: { status: 'accepted' }, orderBy: [{ number: 'asc' }] } },
    });
  }

  findAnswer(db: Db, id: string) {
    return db.answer.findUnique({ where: { id }, include: { set: true } });
  }

  // ---- 조회 ----

  /** (sessionId, projectId) 한 줄 잠금. 트랜잭션이 끝나면 풀린다. */
  async lockView(tx: Tx, sessionId: string, projectId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`view:${sessionId}:${projectId}`}))`;
  }

  async hasViewEvent(
    tx: Tx,
    sessionId: string,
    projectId: string,
    range: { start: Date; end: Date },
  ): Promise<boolean> {
    const count = await tx.event.count({
      where: {
        type: 'project_view',
        source: 'server',
        sessionId,
        projectId,
        serverTs: { gte: range.start, lt: range.end },
      },
    });
    return count > 0;
  }

  /** 집계 행이 없으면 만들고 있으면 1 올린다(동시 요청에도 안전). */
  async bumpStat(tx: Tx, projectId: string, field: StatField): Promise<void> {
    if (field === 'viewCount') {
      await tx.$executeRaw`INSERT INTO "ProjectStat" ("projectId", "viewCount", "updatedAt")
        VALUES (${projectId}::uuid, 1, now())
        ON CONFLICT ("projectId") DO UPDATE SET "viewCount" = "ProjectStat"."viewCount" + 1, "updatedAt" = now()`;
    } else {
      await tx.$executeRaw`INSERT INTO "ProjectStat" ("projectId", "deriveCount", "updatedAt")
        VALUES (${projectId}::uuid, 1, now())
        ON CONFLICT ("projectId") DO UPDATE SET "deriveCount" = "ProjectStat"."deriveCount" + 1, "updatedAt" = now()`;
    }
  }

  // ---- 파생 ----

  createSet(
    tx: Tx,
    data: { projectId: string; pageId: string; prompt: string; presetKey: string | null },
  ) {
    return tx.promptSet.create({ data: { ...data, position: 1 }, select: { id: true } });
  }

  createAnswer(tx: Tx, data: Prisma.AnswerUncheckedCreateInput) {
    return tx.answer.create({ data, select: { id: true } });
  }

  // ---- 댓글 ----

  /** 최신순. cursor 가 있으면 그 댓글보다 이전(createdAt, id 순서). */
  listComments(
    db: Db,
    projectId: string,
    cursor: { createdAt: Date; id: string } | null,
    limit: number,
  ): Promise<AgoraCommentRow[]> {
    return db.agoraComment.findMany({
      where: {
        projectId,
        deletedAt: null,
        hiddenAt: null,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...COMMENT_ARGS,
    });
  }

  findCommentCursor(db: Db, id: string) {
    return db.agoraComment.findUnique({
      where: { id },
      select: { id: true, projectId: true, createdAt: true },
    });
  }

  createComment(
    tx: Tx,
    data: { projectId: string; authorId: string; body: string },
  ): Promise<AgoraCommentRow> {
    return tx.agoraComment.create({ data, ...COMMENT_ARGS });
  }

  findComment(db: Db, id: string) {
    return db.agoraComment.findUnique({
      where: { id },
      select: { id: true, projectId: true, authorId: true, deletedAt: true, hiddenAt: true },
    });
  }

  async softDeleteComment(db: Db, id: string): Promise<number> {
    const result = await db.agoraComment.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count;
  }
}
