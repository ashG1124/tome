import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type Tx = Prisma.TransactionClient;
export type Db = Tx | PrismaService;

const COMMENT_ARGS = { include: { author: true } } as const;
export type CommentRow = Prisma.NodeCommentGetPayload<typeof COMMENT_ARGS>;

@Injectable()
export class CommentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  get client(): PrismaService {
    return this.prisma;
  }

  /** 지우지 않은 코멘트만, 오래된 것부터(같은 시각이면 id 순). */
  listByAnswer(db: Db, answerId: string): Promise<CommentRow[]> {
    return db.nodeComment.findMany({
      where: { answerId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...COMMENT_ARGS,
    });
  }

  create(
    tx: Tx,
    data: { answerId: string; nodeId: string; authorId: string; body: string },
  ): Promise<CommentRow> {
    return tx.nodeComment.create({ data, ...COMMENT_ARGS });
  }

  find(db: Db, id: string): Promise<CommentRow | null> {
    return db.nodeComment.findUnique({ where: { id }, ...COMMENT_ARGS });
  }

  /** 아직 지우지 않은 경우에만 지운다. 지운 행 수를 돌려준다(동시 삭제 구분용). */
  async softDelete(db: Db, id: string): Promise<number> {
    const result = await db.nodeComment.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count;
  }
}
