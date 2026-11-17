import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  type AcceptAnswerResponse,
  type CreateRevisionRequest,
  type CreateRevisionResponse,
  NodeSnapshotSchema,
  type UpdateVerificationRequest,
  VerificationSchema,
  type Verification,
} from '@tome/shared';
import { AppError } from '../../common';
import type { Prisma } from '../../generated/prisma/client';
import { EventsService } from '../events/events.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { UsageService } from '../usage/usage.service';
import type { AuthContext } from '../session/auth.decorators';
import {
  type AnswerRow,
  type Db,
  GenerationRepository,
  isUniqueViolation,
  type ProjectAccessRow,
} from './generation.repository';
import { planRevision } from './revise-plan';

/** 없거나 지워졌거나 숨겨졌으면 404, 남의 것이면 403 (이 순서). */
function requireOwned(project: ProjectAccessRow | null, auth: AuthContext): ProjectAccessRow {
  if (!project || project.deletedAt !== null || project.hiddenAt !== null) {
    throw new AppError('NOT_FOUND');
  }
  if (project.ownerId !== auth.creatorId) throw new AppError('FORBIDDEN');
  return project;
}

/** 편집(미리보기 시작·Apply)·핀·검증 기록. */
@Injectable()
export class EditService {
  constructor(
    private readonly repo: GenerationRepository,
    private readonly idempotency: IdempotencyService,
    private readonly events: EventsService,
    private readonly usage: UsageService,
  ) {}

  private async ownedAnswer(db: Db, auth: AuthContext, id: string): Promise<AnswerRow> {
    const answer = await this.repo.findAnswer(db, id);
    if (!answer) throw new AppError('NOT_FOUND');
    requireOwned(await this.repo.findProject(db, answer.set.projectId), auth);
    return answer;
  }

  createRevision(
    auth: AuthContext,
    key: string | undefined,
    setId: string,
    body: CreateRevisionRequest,
  ) {
    return this.idempotency.run<CreateRevisionResponse>(
      {
        sessionId: auth.sessionId,
        key,
        route: 'POST /sets/:setId/revisions',
        body: { setId, ...body },
      },
      async (tx) => {
        const set = await this.repo.findSet(tx, setId);
        if (!set) throw new AppError('NOT_FOUND');
        const project = requireOwned(set.project, auth);

        const base = await this.repo.findAnswer(tx, body.baseAnswerId);
        if (!base || base.setId !== setId) throw new AppError('NOT_FOUND');
        if (base.status !== 'accepted') {
          throw new AppError('VALIDATION_FAILED', undefined, {
            fields: [{ path: 'baseAnswerId', message: 'The base answer must be accepted.' }],
          });
        }

        const plan = planRevision(NodeSnapshotSchema.parse(base.nodes), body.nodes);
        if (plan.kind === 'invalid') {
          throw new AppError('VALIDATION_FAILED', undefined, {
            fields: [{ path: plan.path, message: plan.message }],
          });
        }
        if (plan.kind === 'none') throw new AppError('NO_CHANGES');
        // 상한이면 429. 편집 재생성은 대체 결과를 쓰지 않으므로 프리셋 예외 없이 막는다.
        await this.usage.assertWithinLimits();

        // 같은 프로젝트의 쓰기를 한 줄로 세운다. 동시에 들어온 revise 는 차례로 앞 job 을 취소한다.
        await this.repo.lockProject(tx, project.id);
        await this.repo.cancelActiveReviseJobs(tx, setId, new Date());
        if (await this.repo.hasActiveJob(tx, project.id)) {
          throw new AppError('GENERATION_IN_PROGRESS');
        }
        // 멱등 기록은 24시간 뒤 지워지지만 job 행은 남는다. 그 키를 다시 쓰면 충돌한다.
        const jobKey = key ?? randomUUID();
        if (key !== undefined && (await this.repo.jobKeyExists(tx, auth.sessionId, key))) {
          throw new AppError('IDEMPOTENCY_KEY_REUSED');
        }

        let job: { id: string };
        try {
          job = await this.repo.createReviseJob(tx, {
            projectId: project.id,
            setId,
            sessionId: auth.sessionId,
            idempotencyKey: jobKey,
            baseAnswerId: base.id,
            requestedNodes: body.nodes as unknown as Prisma.InputJsonValue,
            appliedConnectionIds: body.appliedConnectionIds ?? [],
            startStage: plan.startStage,
          });
        } catch (error) {
          // 잠금 덕분에 보통은 닿지 않는 안전장치: 진행 중 job 부분 유니크.
          if (isUniqueViolation(error)) throw new AppError('GENERATION_IN_PROGRESS');
          throw error;
        }

        return {
          statusCode: 201,
          body: {
            job: {
              id: job.id,
              setId,
              pageId: set.pageId,
              status: 'pending',
              startStage: plan.startStage,
              nextStage: plan.startStage,
              steps: [],
            },
            startStage: plan.startStage,
            changes: plan.changes,
          },
        };
      },
    );
  }

  accept(auth: AuthContext, key: string | undefined, answerId: string) {
    return this.idempotency.run<AcceptAnswerResponse>(
      {
        sessionId: auth.sessionId,
        key,
        route: 'POST /answers/:id/accept',
        body: { answerId },
      },
      async (tx) => {
        const answer = await this.ownedAnswer(tx, auth, answerId);
        // 같은 프로젝트의 확정을 한 줄로 세운다(번호 부여가 겹치지 않게).
        await this.repo.lockProject(tx, answer.set.projectId);
        const number = (await this.repo.maxAcceptedNumber(tx, answer.setId)) + 1;
        let changed: number;
        try {
          changed = await this.repo.acceptDraft(tx, answerId, number);
        } catch (error) {
          if (isUniqueViolation(error)) throw new AppError('NOT_DRAFT');
          throw error;
        }
        if (changed === 0) throw new AppError('NOT_DRAFT');
        await this.repo.touchProject(tx, answer.set.projectId, new Date());
        await this.events.recordServerEvent(tx, {
          type: 'version_save',
          creatorId: auth.creatorId,
          sessionId: auth.sessionId,
          projectId: answer.set.projectId,
          setId: answer.setId,
          answerId,
          payload: { number, baseAnswerId: answer.baseAnswerId },
        });
        return {
          statusCode: 200,
          body: { answer: { id: answerId, number, status: 'accepted' } },
        };
      },
    );
  }

  async pin(auth: AuthContext, answerId: string, pinned: boolean): Promise<{ pinned: boolean }> {
    const answer = await this.ownedAnswer(this.repo.client, auth, answerId);
    if (answer.status !== 'accepted') {
      throw new AppError('VALIDATION_FAILED', undefined, {
        fields: [{ path: 'answer', message: 'Only an accepted answer can be pinned.' }],
      });
    }
    await this.repo.transaction(async (tx) => {
      const changed = await this.repo.setPinned(tx, answerId, pinned);
      if (changed === 0) return;
      await this.events.recordServerEvent(tx, {
        type: 'pin_toggle',
        creatorId: auth.creatorId,
        sessionId: auth.sessionId,
        projectId: answer.set.projectId,
        setId: answer.setId,
        answerId,
        payload: { pinned },
      });
    });
    return { pinned };
  }

  /** criterion·mismatch 의 켜짐/결정을 기록한다(결정은 removed=꺼짐, kept=켜짐으로 저장). */
  async updateVerification(
    auth: AuthContext,
    answerId: string,
    body: UpdateVerificationRequest,
  ): Promise<{ verification: Verification }> {
    const found = await this.ownedAnswer(this.repo.client, auth, answerId);
    return this.repo.transaction(async (tx) => {
      await this.repo.lockProject(tx, found.set.projectId);
      const answer = await this.repo.findAnswer(tx, answerId);
      if (!answer || answer.verification === null) {
        throw new AppError('VALIDATION_FAILED', undefined, {
          fields: [{ path: 'nodes', message: 'This answer has no verification yet.' }],
        });
      }
      const verification = VerificationSchema.parse(answer.verification);
      const targets = [...verification.criteria, ...verification.mismatches];
      for (const [index, change] of body.nodes.entries()) {
        const node = targets.find((n) => n.id === change.id);
        if (!node) {
          throw new AppError('VALIDATION_FAILED', undefined, {
            fields: [{ path: `nodes.${index}.id`, message: 'Unknown verification node.' }],
          });
        }
        node.enabled = change.enabled ?? change.decision === 'kept';
      }
      await this.repo.setAnswerVerification(tx, answerId, verification as Prisma.InputJsonValue);
      return { verification };
    });
  }
}
