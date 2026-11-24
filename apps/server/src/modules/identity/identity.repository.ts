import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaService;

export interface OwnedProject {
  id: string;
  kind: 'original' | 'derive';
  remixPartnerId: string | null;
}

export interface SetCounts {
  setId: string;
  attemptCount: number;
  acceptedCount: number;
}

const CREATOR_SELECT = {
  id: true,
  kind: true,
  displayName: true,
  bio: true,
  avatarKey: true,
  identityPublic: true,
} satisfies Prisma.CreatorSelect;
export type IdentityCreatorRow = Prisma.CreatorGetPayload<{ select: typeof CREATOR_SELECT }>;

@Injectable()
export class IdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 15_000, maxWait: 10_000 });
  }

  /** 창작자별 스냅샷 계산을 한 줄로 세우는 잠금. 트랜잭션이 끝나면 풀린다. */
  async lockCreator(tx: Tx, creatorId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`identity:${creatorId}`}))`;
  }

  findCreator(id: string): Promise<IdentityCreatorRow | null> {
    return this.prisma.creator.findUnique({ where: { id }, select: CREATOR_SELECT });
  }

  /** 공개 아이덴티티를 가진 seed 창작자(seedOrder 순). */
  listPublicSeeds(): Promise<IdentityCreatorRow[]> {
    return this.prisma.creator.findMany({
      where: { kind: 'seed', identityPublic: true },
      orderBy: [{ seedOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      select: CREATOR_SELECT,
    });
  }

  /** 소유한 프로젝트(삭제·숨김 제외). */
  listOwnedProjects(ownerId: string, tx?: Tx): Promise<OwnedProject[]> {
    return (tx ?? this.prisma).project.findMany({
      where: { ownerId, deletedAt: null, hiddenAt: null },
      select: { id: true, kind: true, remixPartnerId: true },
    });
  }

  /** 세트별 답변 수(sample·파생 복사 답변은 시도로 세지 않는다). */
  async countSets(projectIds: string[], tx?: Tx): Promise<SetCounts[]> {
    const db: Db = tx ?? this.prisma;
    if (projectIds.length === 0) return [];
    const sets = await db.promptSet.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    });
    const grouped = await db.answer.groupBy({
      by: ['setId', 'status'],
      where: {
        set: { projectId: { in: projectIds } },
        origin: { notIn: ['sample', 'derived_copy'] },
      },
      _count: { _all: true },
    });
    const counts = new Map<string, SetCounts>(
      sets.map((set) => [set.id, { setId: set.id, attemptCount: 0, acceptedCount: 0 }]),
    );
    for (const row of grouped) {
      const entry = counts.get(row.setId);
      if (!entry) continue;
      entry.attemptCount += row._count._all;
      if (row.status === 'accepted') entry.acceptedCount += row._count._all;
    }
    return [...counts.values()];
  }

  latestSnapshot(creatorId: string, tx?: Tx) {
    return (tx ?? this.prisma).identitySnapshot.findFirst({
      where: { creatorId },
      orderBy: [{ computedAt: 'desc' }, { id: 'desc' }],
    });
  }

  findSnapshot(id: string) {
    return this.prisma.identitySnapshot.findUnique({ where: { id } });
  }

  /** 창작자별 가장 최근 스냅샷 한 줄씩. */
  latestSnapshotsOf(creatorIds: string[]) {
    if (creatorIds.length === 0) return Promise.resolve([]);
    return this.prisma.identitySnapshot.findMany({
      where: { creatorId: { in: creatorIds } },
      orderBy: [{ creatorId: 'asc' }, { computedAt: 'desc' }, { id: 'desc' }],
      distinct: ['creatorId'],
    });
  }

  insertSnapshot(tx: Tx, data: Prisma.IdentitySnapshotUncheckedCreateInput) {
    return tx.identitySnapshot.create({ data });
  }
}
