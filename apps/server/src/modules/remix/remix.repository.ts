import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaService;

const CREATOR_SELECT = {
  id: true,
  kind: true,
  displayName: true,
  bio: true,
  avatarKey: true,
  identityPublic: true,
  seedOrder: true,
} satisfies Prisma.CreatorSelect;
export type CreatorRow = Prisma.CreatorGetPayload<{ select: typeof CREATOR_SELECT }>;

const PROJECT_SELECT = {
  id: true,
  ownerId: true,
  deletedAt: true,
  hiddenAt: true,
  remixPartnerId: true,
  remixPartnerSnapshotId: true,
} satisfies Prisma.ProjectSelect;
export type RemixProjectRow = Prisma.ProjectGetPayload<{ select: typeof PROJECT_SELECT }>;

/** 후보 자격: 시드·페르소나이고 아이덴티티가 공개인 창작자. */
const ELIGIBLE_WHERE = {
  kind: { in: ['seed', 'persona'] },
  identityPublic: true,
} satisfies Prisma.CreatorWhereInput;

export interface AnswerRef {
  id: string;
  nodes: Prisma.JsonValue;
  jobId: string | null;
  setId: string;
  projectId: string;
  project: RemixProjectRow;
}

const ANSWER_SELECT = {
  id: true,
  nodes: true,
  jobId: true,
  setId: true,
  set: { select: { projectId: true, project: { select: PROJECT_SELECT } } },
} satisfies Prisma.AnswerSelect;

export interface NewConnection {
  answerId: string;
  nodeId: string;
  partnerId: string;
  partnerSnapshotId: string;
  predictedAction: string;
  templateKey: string;
  evidenceCount: number;
  evidenceTotal: number;
  axis: string;
}

@Injectable()
export class RemixRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 15_000, maxWait: 10_000 });
  }

  /** 답변 하나의 계산을 한 줄로 세우는 잠금. 트랜잭션이 끝나면 풀린다. */
  async lockAnswer(tx: Tx, answerId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`connections:${answerId}`}))`;
  }

  // ---- 창작자·즐겨찾기 ----

  findCreator(id: string, db: Db = this.prisma): Promise<CreatorRow | null> {
    return db.creator.findUnique({ where: { id }, select: CREATOR_SELECT });
  }

  /** 주어진 id 중 자격 있는 창작자(본인 제외). */
  listEligible(ids: string[], excludeId: string): Promise<CreatorRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.creator.findMany({
      where: { ...ELIGIBLE_WHERE, id: { in: ids, not: excludeId } },
      select: CREATOR_SELECT,
    });
  }

  /** 자격 있는 창작자를 seedOrder 순(null 뒤)으로. */
  listEligibleBySeedOrder(excludeId: string, limit: number): Promise<CreatorRow[]> {
    return this.prisma.creator.findMany({
      where: { ...ELIGIBLE_WHERE, id: { not: excludeId } },
      orderBy: [{ seedOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      take: limit,
      select: CREATOR_SELECT,
    });
  }

  /** 내 즐겨찾기(최근 순). */
  async listFavoriteIds(creatorId: string): Promise<string[]> {
    const rows = await this.prisma.favorite.findMany({
      where: { creatorId },
      orderBy: [{ createdAt: 'desc' }, { targetCreatorId: 'desc' }],
      select: { targetCreatorId: true },
    });
    return rows.map((row) => row.targetCreatorId);
  }

  /** 이미 있으면 그대로 둔다. */
  async addFavorite(creatorId: string, targetCreatorId: string): Promise<void> {
    await this.prisma.favorite.createMany({
      data: [{ creatorId, targetCreatorId }],
      skipDuplicates: true,
    });
  }

  async removeFavorite(creatorId: string, targetCreatorId: string): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { creatorId, targetCreatorId } });
  }

  // ---- 프로젝트 ----

  findProject(id: string, db: Db = this.prisma): Promise<RemixProjectRow | null> {
    return db.project.findUnique({ where: { id }, select: PROJECT_SELECT });
  }

  setPartner(
    projectId: string,
    data: { remixPartnerId: string | null; remixPartnerSnapshotId: string | null },
    db: Db = this.prisma,
  ) {
    return db.project.update({ where: { id: projectId }, data });
  }

  /** 상대는 있는데 스냅샷이 비어 있는 프로젝트(생성 때 상대를 정한 경우)에 한 번만 고정한다. */
  async pinSnapshotIfMissing(
    projectId: string,
    partnerId: string,
    snapshotId: string,
  ): Promise<void> {
    await this.prisma.project.updateMany({
      where: { id: projectId, remixPartnerId: partnerId, remixPartnerSnapshotId: null },
      data: { remixPartnerSnapshotId: snapshotId },
    });
  }

  // ---- 답변 ----

  async findAnswer(id: string, db: Db = this.prisma): Promise<AnswerRef | null> {
    const row = await db.answer.findUnique({ where: { id }, select: ANSWER_SELECT });
    if (!row) return null;
    return {
      id: row.id,
      nodes: row.nodes,
      jobId: row.jobId,
      setId: row.setId,
      projectId: row.set.projectId,
      project: row.set.project,
    };
  }

  // ---- Connection ----

  listConnections(answerId: string, partnerId: string, db: Db = this.prisma) {
    return db.connection.findMany({ where: { answerId, partnerId } });
  }

  async insertConnections(tx: Tx, rows: NewConnection[]): Promise<void> {
    if (rows.length === 0) return;
    await tx.connection.createMany({ data: rows, skipDuplicates: true });
  }

  /** dismiss 대상과 그 답변이 속한 프로젝트. */
  async findConnectionWithProject(id: string) {
    const row = await this.prisma.connection.findUnique({
      where: { id },
      select: {
        id: true,
        nodeId: true,
        status: true,
        answerId: true,
        partnerId: true,
        answer: {
          select: {
            setId: true,
            set: { select: { projectId: true, project: { select: PROJECT_SELECT } } },
          },
        },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      nodeId: row.nodeId,
      status: row.status,
      answerId: row.answerId,
      partnerId: row.partnerId,
      setId: row.answer.setId,
      projectId: row.answer.set.projectId,
      project: row.answer.set.project,
    };
  }

  /** shown → dismissed. 실제로 바뀌었으면 true. */
  async dismissIfShown(tx: Tx, id: string): Promise<boolean> {
    const result = await tx.connection.updateMany({
      where: { id, status: 'shown' },
      data: { status: 'dismissed' },
    });
    return result.count === 1;
  }

  findConnectionStatus(id: string, db: Db = this.prisma) {
    return db.connection.findUnique({ where: { id }, select: { status: true } });
  }

  /** revise 가 받은 Connection id 중 그 답변·그 상대의 것이 몇 개인지. */
  countConnections(tx: Tx, ids: string[], answerId: string, partnerId: string): Promise<number> {
    return tx.connection.count({ where: { id: { in: ids }, answerId, partnerId } });
  }

  async jobAppliedIds(tx: Tx, jobId: string): Promise<string[]> {
    const job = await tx.generationJob.findUnique({
      where: { id: jobId },
      select: { appliedConnectionIds: true },
    });
    return job?.appliedConnectionIds ?? [];
  }

  /** 아직 applied 가 아닌 것만 골라 applied 로 바꾸고, 바뀐 행을 돌려준다. */
  async markApplied(tx: Tx, ids: string[], appliedInAnswerId: string) {
    const rows = await tx.connection.findMany({
      where: { id: { in: ids }, status: { not: 'applied' } },
      select: { id: true, nodeId: true, answerId: true },
      orderBy: { id: 'asc' },
    });
    if (rows.length === 0) return rows;
    await tx.connection.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, status: { not: 'applied' } },
      data: { status: 'applied', appliedInAnswerId },
    });
    return rows;
  }
}
