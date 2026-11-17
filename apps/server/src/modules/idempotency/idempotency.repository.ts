import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type Tx = Prisma.TransactionClient;

export interface IdempotencyRow {
  route: string;
  requestHash: string;
  statusCode: number;
  response: Prisma.JsonValue;
  createdAt: Date;
}

export interface NewIdempotencyRecord {
  sessionId: string;
  key: string;
  route: string;
  requestHash: string;
}

/** 같은 (sessionId, key) 기본키를 두 번 넣으려 할 때 나는 유니크 위반인지. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class IdempotencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 15_000, maxWait: 5_000 });
  }

  /** 보관 기간이 지난 기록을 지운다. */
  async deleteExpired(tx: Tx | PrismaService, sessionId: string, key: string, olderThan: Date) {
    await tx.idempotencyRecord.deleteMany({
      where: { sessionId, key, createdAt: { lt: olderThan } },
    });
  }

  /** 자리표시(statusCode 0)를 넣는다. 같은 키가 이미 있으면 유니크 위반으로 실패한다. */
  async insertPlaceholder(tx: Tx, record: NewIdempotencyRecord): Promise<void> {
    await tx.idempotencyRecord.create({
      data: { ...record, statusCode: 0, response: {} },
    });
  }

  async complete(
    tx: Tx,
    sessionId: string,
    key: string,
    statusCode: number,
    response: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.idempotencyRecord.update({
      where: { sessionId_key: { sessionId, key } },
      data: { statusCode, response },
    });
  }

  find(sessionId: string, key: string): Promise<IdempotencyRow | null> {
    return this.prisma.idempotencyRecord.findUnique({
      where: { sessionId_key: { sessionId, key } },
      select: {
        route: true,
        requestHash: true,
        statusCode: true,
        response: true,
        createdAt: true,
      },
    });
  }
}
