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

@Injectable()
export class AccessCodesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async creatorExists(id: string): Promise<boolean> {
    const row = await this.prisma.creator.findUnique({ where: { id }, select: { id: true } });
    return row !== null;
  }

  /** label 에 유니크 제약이 없어, 같은 label 의 동시 요청은 advisory lock 으로 줄 세운다. */
  upsertByLabel(label: string, input: AccessCodeInput): Promise<AccessCodeRecord> {
    return this.prisma.$transaction(async (tx) => {
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
    });
  }
}
