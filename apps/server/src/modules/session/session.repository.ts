import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreatorRow {
  id: string;
  kind: 'seed' | 'persona' | 'visitor';
  displayName: string;
  bio: string | null;
}

export interface AccessCodeRow {
  id: string;
  codeHash: string;
  target: 'visitor_pool' | 'creator';
  creatorId: string | null;
}

export interface SessionRow {
  id: string;
  creatorId: string;
  lastSeenAt: Date;
}

export interface NewSession {
  tokenHash: string;
  creatorId: string;
  accessCodeId: string;
  userAgent: string | null;
  expiresAt: Date;
}

export const VISITOR_CURSOR_KEY = 'visitorCursor';
export const NOTICE_VERSION_KEY = 'noticeVersion';

@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveAccessCodes(): Promise<AccessCodeRow[]> {
    return this.prisma.accessCode.findMany({
      where: { active: true },
      select: { id: true, codeHash: true, target: true, creatorId: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 방문자 계정 id 를 순서대로. seedOrder 가 있는 계정이 있으면 그것만(오름차순), 없으면 kind=visitor 전체(id 순). */
  async listVisitorIds(): Promise<string[]> {
    const ordered = await this.prisma.creator.findMany({
      where: { kind: 'visitor', seedOrder: { not: null } },
      select: { id: true },
      orderBy: { seedOrder: 'asc' },
    });
    if (ordered.length > 0) return ordered.map((row) => row.id);
    const all = await this.prisma.creator.findMany({
      where: { kind: 'visitor' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return all.map((row) => row.id);
  }

  /** 방문자 순서 카운터를 한 문장으로 원자적으로 1 올리고 올린 값(1부터)을 돌려준다. */
  async nextVisitorCursor(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      INSERT INTO "AppSetting" ("key", "value", "updatedAt")
      VALUES (${VISITOR_CURSOR_KEY}, '1'::jsonb, now())
      ON CONFLICT ("key") DO UPDATE
        SET "value" = to_jsonb((("AppSetting"."value" #>> '{}')::bigint) + 1),
            "updatedAt" = now()
      RETURNING (("AppSetting"."value" #>> '{}')::bigint) AS n
    `);
    return Number(rows[0]!.n);
  }

  async getNoticeVersion(): Promise<string | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: NOTICE_VERSION_KEY } });
    if (!row) return null;
    return typeof row.value === 'string' || typeof row.value === 'number'
      ? String(row.value)
      : null;
  }

  createSession(data: NewSession): Promise<{ id: string }> {
    return this.prisma.demoSession.create({ data, select: { id: true } });
  }

  /** 만료·폐기되지 않은 세션만 찾는다. */
  findLiveSessionByTokenHash(tokenHash: string, now: Date): Promise<SessionRow | null> {
    return this.prisma.demoSession.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true, creatorId: true, lastSeenAt: true },
    });
  }

  async touchSession(sessionId: string, now: Date): Promise<void> {
    await this.prisma.demoSession.update({ where: { id: sessionId }, data: { lastSeenAt: now } });
  }

  async revokeSession(sessionId: string, now: Date): Promise<void> {
    await this.prisma.demoSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  findCreator(id: string): Promise<CreatorRow | null> {
    return this.prisma.creator.findUnique({
      where: { id },
      select: { id: true, kind: true, displayName: true, bio: true },
    });
  }

  async hasConsent(sessionId: string, noticeVersion: string): Promise<boolean> {
    const row = await this.prisma.consentRecord.findUnique({
      where: { sessionId_noticeVersion: { sessionId, noticeVersion } },
      select: { id: true },
    });
    return row !== null;
  }

  /** 이미 있으면 그대로 두고(ON CONFLICT DO NOTHING) 기존 행의 agreedAt 을 돌려준다. */
  async ensureConsent(sessionId: string, creatorId: string, noticeVersion: string): Promise<Date> {
    await this.prisma.consentRecord.createMany({
      data: [{ sessionId, creatorId, noticeVersion }],
      skipDuplicates: true,
    });
    const row = await this.prisma.consentRecord.findUniqueOrThrow({
      where: { sessionId_noticeVersion: { sessionId, noticeVersion } },
      select: { agreedAt: true },
    });
    return row.agreedAt;
  }
}
