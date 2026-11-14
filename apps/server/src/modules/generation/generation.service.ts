import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  type CancelJobResponse,
  type CreatePageResponse,
  type CreateSetRequest,
  type CreateSetResponse,
  type GetJobResponse,
  LIMITS,
  type WorkspaceResponse,
} from '@tome/shared';
import { AppError } from '../../common';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { AuthContext } from '../session/auth.decorators';
import { ProjectsService } from '../projects/projects.service';
import {
  type Db,
  GenerationRepository,
  isCheckViolation,
  isUniqueViolation,
  type ProjectAccessRow,
} from './generation.repository';
import { toAnswer, toAnswerSummary, toJob, toStepResponse } from './generation.mappers';

@Injectable()
export class GenerationService {
  constructor(
    private readonly repo: GenerationRepository,
    private readonly idempotency: IdempotencyService,
    private readonly projects: ProjectsService,
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
    return response;
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

  createSet(auth: AuthContext, key: string | undefined, projectId: string, body: CreateSetRequest) {
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
