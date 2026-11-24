import { randomUUID } from 'node:crypto';
import { creatorAvatarUrl } from '../avatars/avatar-url';
import { Injectable } from '@nestjs/common';
import {
  type CancelJobResponse,
  type CreatePageResponse,
  type CreateSetRequest,
  type CreateSetResponse,
  type GetJobResponse,
  LIMITS,
  type WorkspaceDerivedFrom,
  type WorkspaceResponse,
} from '@tome/shared';
import { AppError } from '../../common';
import { isPublicProject } from '../agora/agora.rules';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { AuthContext } from '../session/auth.decorators';
import { InputSafetyService, isValidKey } from '../projects/input-safety.service';
import { ProjectsService } from '../projects/projects.service';
import { UsageService } from '../usage/usage.service';
import {
  type Db,
  GenerationRepository,
  isCheckViolation,
  isUniqueViolation,
  type ProjectAccessRow,
} from './generation.repository';
import { isPublicAnswer } from './answers.service';
import {
  answerImageUrl,
  answerThumbUrl,
  toAnswer,
  toAnswerSummary,
  toJob,
  toStepResponse,
} from './generation.mappers';

@Injectable()
export class GenerationService {
  constructor(
    private readonly repo: GenerationRepository,
    private readonly idempotency: IdempotencyService,
    private readonly projects: ProjectsService,
    private readonly usage: UsageService,
    private readonly safety: InputSafetyService,
  ) {}

  /** 없거나 지워졌거나 숨겨졌으면 404, 남의 것이면 403 (이 순서). */
  private async requireOwnedProject(
    db: Db,
    auth: AuthContext,
    id: string,
  ): Promise<ProjectAccessRow> {
    const project = await this.repo.findProject(db, id);
    if (!project || project.deletedAt !== null || project.hiddenAt !== null) {
      throw new AppError('NOT_FOUND');
    }
    if (project.ownerId !== auth.creatorId) throw new AppError('FORBIDDEN');
    return project;
  }

  async workspace(
    auth: AuthContext,
    projectId: string,
    pageId: string | undefined,
  ): Promise<WorkspaceResponse> {
    const project = await this.projects.getOwnedSummary(auth, projectId);
    const pages = await this.repo.listPages(this.repo.client, projectId);
    if (pages.length === 0) throw new AppError('NOT_FOUND');
    const current =
      pageId === undefined ? pages[pages.length - 1]! : pages.find((page) => page.id === pageId);
    if (!current) throw new AppError('NOT_FOUND');

    const sets = await this.repo.listSetsWithAnswers(this.repo.client, current.id);
    const activeJob = await this.repo.findActiveJob(this.repo.client, projectId);

    const response: WorkspaceResponse = {
      project,
      pages: pages.map((page) => ({
        id: page.id,
        index: page.index,
        setCount: page._count.sets,
      })),
      currentPageId: current.id,
      sets: sets.map((set) => {
        const latest = set.answers[set.answers.length - 1];
        return {
          id: set.id,
          position: set.position,
          prompt: set.prompt,
          latestAnswer: latest ? toAnswer(latest) : null,
          answers: set.answers.map(toAnswerSummary),
        };
      }),
    };
    if (activeJob) response.activeJob = toJob(activeJob);
    if (project.kind === 'derive') {
      const derivedFrom = await this.derivedFromOf(projectId);
      if (derivedFrom) response.derivedFrom = derivedFrom;
    }
    return response;
  }

  /**
   * 파생 프로젝트의 원작 표시. 원작이 지워졌거나 비공개면 제목·원작자·답변을 비운다(ADR-015, 아고라와 같은 규칙).
   * 원작 답변은 원작 프로젝트의 공개 답변일 때만 내보내 비공개 이미지를 노출하지 않는다.
   */
  private async derivedFromOf(projectId: string): Promise<WorkspaceDerivedFrom | null> {
    const row = await this.repo.findDerivedOrigin(this.repo.client, projectId);
    if (!row?.derivedFromProjectId) return null;
    const original = row.derivedFrom;
    if (!original || !isPublicProject(original)) {
      return { projectId: row.derivedFromProjectId, title: null, creator: null, answer: null };
    }
    const answer = row.derivedFromAnswer;
    const visible =
      answer !== null &&
      answer.number !== null &&
      answer.set.projectId === original.id &&
      isPublicAnswer(original, answer);
    return {
      projectId: original.id,
      title: original.title,
      creator: {
        id: original.owner.id,
        kind: original.owner.kind,
        displayName: original.owner.displayName,
        bio: original.owner.bio,
        avatarUrl: creatorAvatarUrl(original.owner),
      },
      answer: visible
        ? {
            id: answer.id,
            number: answer.number!,
            imageUrl: answerImageUrl(answer.id),
            thumbUrl: answerThumbUrl(answer.id),
          }
        : null,
    };
  }

  createPage(auth: AuthContext, key: string | undefined, projectId: string) {
    return this.idempotency.run<CreatePageResponse>(
      {
        sessionId: auth.sessionId,
        key,
        route: 'POST /projects/:id/pages',
        // 같은 키를 다른 프로젝트에 쓰면 다른 요청이어야 하므로 프로젝트 id 를 본문 해시에 넣는다.
        body: { projectId },
      },
      async (tx) => {
        await this.requireOwnedProject(tx, auth, projectId);
        await this.repo.lockProject(tx, projectId);
        const max = await this.repo.maxPageIndex(tx, projectId);
        const index = (max ?? -1) + 1;
        if (index >= LIMITS.PAGES_MAX) throw new AppError('PAGE_LIMIT_REACHED');
        try {
          const page = await this.repo.createPage(tx, projectId, index);
          return { statusCode: 201, body: { page } };
        } catch (error) {
          if (isUniqueViolation(error) || isCheckViolation(error)) {
            throw new AppError('PAGE_LIMIT_REACHED');
          }
          throw error;
        }
      },
    );
  }

  /**
   * 입력 안전 검사(트랜잭션 밖). 순서: 세트 수 확인(409) → 안전 검사. 한도 확인·생성은 이어지는 트랜잭션이 맡는다.
   * 여기의 읽기는 잠금 없는 사전 확인이라 최종 판단은 트랜잭션 안의 같은 확인이 한다.
   */
  private async checkSetInput(
    auth: AuthContext,
    key: string | undefined,
    projectId: string,
    body: CreateSetRequest,
  ): Promise<void> {
    if (body.attachmentId !== undefined || !isValidKey(key)) return;
    const db = this.repo.client;
    // 같은 키로 이미 만든 작업이 있으면 재생(또는 409)이므로 사전 확인·검사를 모두 건너뛴다.
    if (await this.repo.jobKeyExists(db, auth.sessionId, key)) return;
    await this.requireOwnedProject(db, auth, projectId);
    if (!(await this.repo.pageBelongsToProject(db, projectId, body.pageId))) {
      throw new AppError('NOT_FOUND');
    }
    if (await this.repo.hasActiveJob(db, projectId)) throw new AppError('GENERATION_IN_PROGRESS');
    if ((await this.repo.countSets(db, body.pageId)) >= LIMITS.SETS_PER_PAGE) {
      throw new AppError('SET_LIMIT_REACHED');
    }
    await this.safety.assertSafe(body.prompt);
  }

  async createSet(
    auth: AuthContext,
    key: string | undefined,
    projectId: string,
    body: CreateSetRequest,
  ) {
    await this.checkSetInput(auth, key, projectId, body);
    return this.idempotency.run<CreateSetResponse>(
      {
        sessionId: auth.sessionId,
        key,
        route: 'POST /projects/:id/sets',
        body: { projectId, ...body },
      },
      async (tx) => {
        if (body.attachmentId !== undefined) {
          throw new AppError('VALIDATION_FAILED', undefined, {
            fields: [{ path: 'attachmentId', message: 'Attachments are not supported yet.' }],
          });
        }
        await this.requireOwnedProject(tx, auth, projectId);
        if (!(await this.repo.pageBelongsToProject(tx, projectId, body.pageId))) {
          throw new AppError('NOT_FOUND');
        }
        await this.repo.lockProject(tx, projectId);

        if (await this.repo.hasActiveJob(tx, projectId)) {
          throw new AppError('GENERATION_IN_PROGRESS');
        }
        const count = await this.repo.countSets(tx, body.pageId);
        if (count >= LIMITS.SETS_PER_PAGE) throw new AppError('SET_LIMIT_REACHED');
        // 멱등 기록은 24시간 뒤 지워지지만 job 행은 남는다. 그 키를 다시 쓰면 충돌한다.
        if (key !== undefined && (await this.repo.jobKeyExists(tx, auth.sessionId, key))) {
          throw new AppError('IDEMPOTENCY_KEY_REUSED');
        }

        // 세트·job 을 만들기 전에 상한을 본다. 프리셋 그대로면 통과(advance 가 대체 결과로 채운다).
        await this.usage.assertWithinLimitsOrSample(body.presetKey, body.prompt);

        let set: { id: string; position: number; prompt: string };
        let job: { id: string };
        try {
          set = await this.repo.createSet(tx, {
            projectId,
            pageId: body.pageId,
            position: count + 1,
            prompt: body.prompt,
            presetKey: body.presetKey ?? null,
          });
          job = await this.repo.createCreateJob(tx, {
            projectId,
            setId: set.id,
            sessionId: auth.sessionId,
            idempotencyKey: key ?? randomUUID(),
          });
        } catch (error) {
          // 잠금 덕분에 보통은 닿지 않는 안전장치: 진행 중 job 부분 유니크·세트 자리 유니크·CHECK.
          if (isUniqueViolation(error)) throw new AppError('GENERATION_IN_PROGRESS');
          if (isCheckViolation(error)) throw new AppError('SET_LIMIT_REACHED');
          throw error;
        }
        await this.repo.touchProject(tx, projectId, new Date());

        return {
          statusCode: 201,
          body: {
            set: {
              id: set.id,
              position: set.position,
              prompt: set.prompt,
              latestAnswer: null,
              answers: [],
            },
            job: {
              id: job.id,
              setId: set.id,
              pageId: body.pageId,
              status: 'pending',
              startStage: 'analyze',
              nextStage: 'analyze',
              steps: [],
            },
          },
        };
      },
    );
  }

  /** 내 job(남의 것·삭제·숨김 프로젝트의 job 은 404). */
  private async requireOwnedJob(auth: AuthContext, jobId: string) {
    const job = await this.repo.findJob(this.repo.client, jobId);
    if (
      !job ||
      job.project.ownerId !== auth.creatorId ||
      job.project.deletedAt !== null ||
      job.project.hiddenAt !== null
    ) {
      throw new AppError('NOT_FOUND');
    }
    return job;
  }

  async getJob(auth: AuthContext, jobId: string): Promise<GetJobResponse> {
    const job = await this.requireOwnedJob(auth, jobId);
    const ordered = [...job.steps];
    const image = ordered.find((s) => s.stage === 'image' && s.status === 'succeeded');
    const answerId = (image?.output as { answerId?: string } | null)?.answerId;
    const answerRow = answerId ? await this.repo.findAnswer(this.repo.client, answerId) : null;
    const answer = answerRow ? toAnswer(answerRow) : undefined;
    return {
      job: toJob(job),
      steps: toJob(job).steps.map((brief) => {
        const row = ordered.find((s) => s.stage === brief.stage)!;
        return toStepResponse(row, answer ? { answer } : {});
      }),
    };
  }

  async cancelJob(auth: AuthContext, jobId: string): Promise<CancelJobResponse> {
    const job = await this.requireOwnedJob(auth, jobId);
    if (job.status === 'succeeded' || job.status === 'failed') throw new AppError('JOB_CLOSED');
    if (job.status !== 'cancelled') {
      const changed = await this.repo.cancelJob(jobId, new Date());
      if (changed === 0) {
        // 읽은 뒤 다른 요청이 먼저 끝냈다. 취소돼 있으면 그대로 200, 성공·실패로 끝났으면 409.
        const latest = await this.repo.findJob(this.repo.client, jobId);
        if (latest && latest.status !== 'cancelled') throw new AppError('JOB_CLOSED');
      }
    }
    const fresh = await this.repo.findJobWithSteps(this.repo.client, jobId);
    return { job: toJob(fresh!) };
  }
}
