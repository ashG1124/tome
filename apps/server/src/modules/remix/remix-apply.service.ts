import { Injectable } from '@nestjs/common';
import { AppError } from '../../common';
import { EventsService } from '../events/events.service';
import type { AuthContext } from '../session/auth.decorators';
import { RemixRepository, type Tx } from './remix.repository';

/** revise·accept 가 부르는 Connection Apply 규칙. 생성 모듈과 순환하지 않게 리믹스 본체와 나눴다. */
@Injectable()
export class RemixApplyService {
  constructor(
    private readonly repo: RemixRepository,
    private readonly events: EventsService,
  ) {}

  /** revise 에 실린 Connection id 가 모두 그 답변·현재 상대의 것이어야 한다. */
  async assertApplicable(
    tx: Tx,
    input: { answerId: string; partnerId: string | null; ids: string[] | undefined },
  ): Promise<void> {
    const ids = [...new Set(input.ids ?? [])];
    if (ids.length === 0) return;
    const valid =
      input.partnerId !== null &&
      (await this.repo.countConnections(tx, ids, input.answerId, input.partnerId)) === ids.length;
    if (!valid) {
      throw new AppError('VALIDATION_FAILED', undefined, {
        fields: [
          {
            path: 'appliedConnectionIds',
            message: 'Use connections shown for this answer and the current partner.',
          },
        ],
      });
    }
  }

  /** 확정된 draft 를 만든 job 이 Connection 을 받았다면 applied 로 바꾸고 이벤트를 남긴다. */
  async applyOnAccept(
    tx: Tx,
    auth: AuthContext,
    accepted: { id: string; jobId: string | null; setId: string; projectId: string },
  ): Promise<void> {
    if (accepted.jobId === null) return;
    const ids = await this.repo.jobAppliedIds(tx, accepted.jobId);
    if (ids.length === 0) return;
    const changed = await this.repo.markApplied(tx, ids, accepted.id);
    for (const row of changed) {
      await this.events.recordServerEvent(tx, {
        type: 'connection_apply',
        creatorId: auth.creatorId,
        sessionId: auth.sessionId,
        projectId: accepted.projectId,
        setId: accepted.setId,
        answerId: accepted.id,
        payload: { connectionId: row.id, nodeId: row.nodeId, fromAnswerId: row.answerId },
      });
    }
  }
}
