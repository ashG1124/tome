import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VISITOR_CURSOR_KEY } from '../session/session.repository';

export type Tx = Prisma.TransactionClient;

/** 데모 리셋이 쓰는 DB 호출만 모은다. 규칙(범위·순서)은 service 가 정한다. */
@Injectable()
export class ResetRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 리셋은 오래 걸릴 수 있어 트랜잭션 제한 시간을 넉넉히 둔다. */
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 120_000, maxWait: 120_000 });
  }

  /** 동시에 온 리셋 두 번을 한 줄로 세운다. 트랜잭션이 끝나면 풀린다. */
  async lock(tx: Tx): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('admin:reset'))`;
  }

  async creatorIds(tx: Tx, kind: 'seed' | 'persona' | 'visitor'): Promise<string[]> {
    const rows = await tx.creator.findMany({ where: { kind }, select: { id: true } });
    return rows.map((row) => row.id);
  }

  /** 지울 답변의 저장소 키(이미지·썸네일·편집 입력). */
  async answerKeysOf(tx: Tx, ownerIds: string[]): Promise<{ id: string; keys: string[] }[]> {
    const rows = await tx.answer.findMany({
      where: { set: { project: { ownerId: { in: ownerIds } } } },
      select: { id: true, imageKey: true, thumbKey: true, editInputKey: true },
    });
    return rows.map((row) => ({
      id: row.id,
      keys: [row.imageKey, row.thumbKey, row.editInputKey].filter((k): k is string => k !== null),
    }));
  }

  /** 상대가 이 창작자들인 Connection(그 스냅샷을 지우기 전에). */
  async deleteConnectionsWithPartners(tx: Tx, partnerIds: string[]): Promise<void> {
    await tx.connection.deleteMany({ where: { partnerId: { in: partnerIds } } });
  }

  /** 프로젝트를 물리 삭제한다(페이지·세트·답변·job·집계·아고라 댓글·이벤트가 같이 지워진다). 지운 개수를 돌려준다. */
  async deleteProjects(tx: Tx, ownerIds: string[]): Promise<number> {
    const result = await tx.project.deleteMany({ where: { ownerId: { in: ownerIds } } });
    return result.count;
  }

  /** 이벤트·댓글·즐겨찾기·스냅샷(프로젝트 밖에 남은 것). */
  async deleteActivity(tx: Tx, creatorIds: string[]): Promise<void> {
    await tx.event.deleteMany({ where: { creatorId: { in: creatorIds } } });
    await tx.agoraComment.deleteMany({ where: { authorId: { in: creatorIds } } });
    await tx.nodeComment.deleteMany({ where: { authorId: { in: creatorIds } } });
    await tx.favorite.deleteMany({ where: { creatorId: { in: creatorIds } } });
    await tx.identitySnapshot.deleteMany({ where: { creatorId: { in: creatorIds } } });
  }

  /** 세션·동의 기록·그 세션의 멱등 기록(visitor 전용). */
  async deleteSessions(tx: Tx, creatorIds: string[]): Promise<void> {
    const sessions = await tx.demoSession.findMany({
      where: { creatorId: { in: creatorIds } },
      select: { id: true },
    });
    await tx.idempotencyRecord.deleteMany({
      where: { sessionId: { in: sessions.map((s) => s.id) } },
    });
    await tx.consentRecord.deleteMany({ where: { creatorId: { in: creatorIds } } });
    await tx.demoSession.deleteMany({ where: { creatorId: { in: creatorIds } } });
  }

  /** 방문자 배정 순서를 처음(Visitor 1)으로. 다음 로그인이 1번을 받는다. */
  async resetVisitorCursor(tx: Tx): Promise<void> {
    await tx.appSetting.upsert({
      where: { key: VISITOR_CURSOR_KEY },
      update: { value: 0 },
      create: { key: VISITOR_CURSOR_KEY, value: 0 },
    });
  }

  /** seed 프로젝트에 남은 비시드 댓글·노드 코멘트·Connection 을 지운다. */
  async cleanSeedProjects(tx: Tx, seedIds: string[], keepCommentIds: string[]): Promise<void> {
    const ownedBySeed = { set: { project: { ownerId: { in: seedIds } } } };
    await tx.agoraComment.deleteMany({
      where: { project: { ownerId: { in: seedIds } }, id: { notIn: keepCommentIds } },
    });
    await tx.nodeComment.deleteMany({ where: { answer: ownedBySeed } });
    await tx.connection.deleteMany({ where: { answer: ownedBySeed } });
  }
}
