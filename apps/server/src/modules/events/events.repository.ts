import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type Tx = Prisma.TransactionClient;

export interface NewEventRow {
  id: string;
  schemaVersion: number;
  type: string;
  creatorId: string;
  sessionId: string | null;
  projectId: string | null;
  setId: string | null;
  answerId: string | null;
  payload: Prisma.InputJsonObject;
  clientTs: Date | null;
  serverTs: Date;
  source: 'client' | 'server';
}

export interface SetRef {
  id: string;
  projectId: string;
}

export interface AnswerRef {
  id: string;
  setId: string;
  projectId: string;
}

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 이미 있는 id 는 건너뛰고(ON CONFLICT DO NOTHING) 실제로 넣은 개수를 돌려준다. */
  async insertManyIgnoringDuplicates(rows: NewEventRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    const result = await this.prisma.event.createMany({ data: rows, skipDuplicates: true });
    return result.count;
  }

  /** 서버 이벤트 한 건. 호출한 쪽의 트랜잭션 안에서 저장된다. */
  async insertInTransaction(tx: Tx, row: NewEventRow): Promise<void> {
    await tx.event.create({ data: row });
  }

  /** 이 창작자가 읽을 수 있는 프로젝트 id(내 것, 또는 게시된 남의 것. 삭제·숨김 제외). */
  async findReadableProjectIds(creatorId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.project.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        hiddenAt: null,
        OR: [{ ownerId: creatorId }, { postedAt: { not: null } }],
      },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }

  findSets(ids: string[]): Promise<SetRef[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.promptSet.findMany({
      where: { id: { in: ids } },
      select: { id: true, projectId: true },
    });
  }

  async findAnswers(ids: string[]): Promise<AnswerRef[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.answer.findMany({
      where: { id: { in: ids } },
      select: { id: true, setId: true, set: { select: { projectId: true } } },
    });
    return rows.map((row) => ({ id: row.id, setId: row.setId, projectId: row.set.projectId }));
  }

  /**
   * 창작자의 이벤트를 서버 시각 순으로. 기본은 삭제·숨김 프로젝트에 이어진 이벤트를 뺀다.
   * includeRemovedProjects 를 켜면 모두 돌려준다.
   */
  listForCreator(creatorId: string, options: { includeRemovedProjects?: boolean } = {}) {
    return this.prisma.event.findMany({
      where: {
        creatorId,
        ...(options.includeRemovedProjects
          ? {}
          : { OR: [{ projectId: null }, { project: { deletedAt: null, hiddenAt: null } }] }),
      },
      orderBy: [{ serverTs: 'asc' }, { id: 'asc' }],
    });
  }
}
