import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AccessCodeRecord {
  id: string;
  label: string;
  target: 'visitor_pool' | 'creator';
  creatorId: string | null;
  active: boolean;
  createdAt: Date;
}

export interface AccessCodeInput {
  codeHash: string;
  target: 'visitor_pool' | 'creator';
  creatorId: string | null;
  active: boolean;
}

const SELECT = {
  id: true,
  label: true,
  target: true,
  creatorId: true,
  active: true,
  createdAt: true,
} as const;

/**
 * label 로 접속 코드를 넣거나 바꾼다(트랜잭션 안에서 부른다). label 에 유니크 제약이 없어
 * 같은 label 의 동시 요청은 advisory lock 으로 줄 세운다. 가장 먼저 만든 행을 고친다.
 * 관리 API 와 시드(쇼케이스 코드)가 같이 쓴다.
 */
export async function upsertAccessCodeByLabel(
  tx: Prisma.TransactionClient,
  label: string,
  input: AccessCodeInput,
): Promise<AccessCodeRecord> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'accessCode:' + label}))`,
  );
  const existing = await tx.accessCode.findFirst({
    where: { label },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (existing) {
    return tx.accessCode.update({ where: { id: existing.id }, data: input, select: SELECT });
  }
  return tx.accessCode.create({ data: { label, ...input }, select: SELECT });
}

@Injectable()
export class AccessCodesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async creatorExists(id: string): Promise<boolean> {
    const row = await this.prisma.creator.findUnique({ where: { id }, select: { id: true } });
    return row !== null;
  }

  /** label 에 유니크 제약이 없어, 같은 label 의 동시 요청은 advisory lock 으로 줄 세운다. */
  upsertByLabel(label: string, input: AccessCodeInput): Promise<AccessCodeRecord> {
    return this.prisma.$transaction((tx) => upsertAccessCodeByLabel(tx, label, input));
  }
}
