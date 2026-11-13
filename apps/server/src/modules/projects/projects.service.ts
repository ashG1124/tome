import { Injectable } from '@nestjs/common';
import type {
  CreateProjectRequest,
  CreateProjectResponse,
  Job,
  ProjectListResponse,
  ProjectSummary,
  PromptSet,
  UpdateProjectRequest,
  UpdateProjectResponse,
} from '@tome/shared';
import { AppError } from '../../common';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { AuthContext } from '../session/auth.decorators';
import {
  JobKeyTakenError,
  type ProjectRow,
  ProjectsRepository,
  type Tx,
} from './projects.repository';
import { makeTitle, planShelfOrder, resolvePrompt, shelfChanges } from './projects.rules';

/** 서가에 보여 주는 프로젝트 수 상한. */
export const SHELF_LIMIT = 50;

export function toSummary(row: ProjectRow): ProjectSummary {
  const summary: ProjectSummary = {
    id: row.id,
    title: row.title,
    status: row.status,
    posted: row.postedAt !== null,
    coverThumbUrl: row.coverAnswerId ? `/assets/answers/${row.coverAnswerId}/thumb` : null,
    lastEditedAt: row.lastEditedAt.toISOString(),
    shelfPosition: row.shelfPosition,
    kind: row.kind,
  };
  if (row.remixPartner) summary.remixPartner = { ...row.remixPartner, avatarUrl: null };
  return summary;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly repo: ProjectsRepository,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(auth: AuthContext): Promise<ProjectListResponse> {
    const rows = await this.repo.listVisible(auth.creatorId, SHELF_LIMIT);
    // 관리자가 숨긴 프로젝트 자리가 비어도 보이는 것만 0..n-1 로 보여 준다.
    return { projects: rows.map((row, index) => toSummary({ ...row, shelfPosition: index })) };
  }

  create(auth: AuthContext, key: string | undefined, body: CreateProjectRequest) {
    return this.idempotency.run<CreateProjectResponse>(
      { sessionId: auth.sessionId, key, route: 'POST /projects', body },
      async (tx) => {
        if (body.attachmentId !== undefined) {
          throw new AppError('VALIDATION_FAILED', undefined, {
            fields: [{ path: 'attachmentId', message: 'Attachments are not supported yet.' }],
          });
        }
        const partnerId = body.remixPartnerId ?? null;
        if (partnerId !== null) {
          if (partnerId === auth.creatorId || !(await this.repo.creatorExists(tx, partnerId))) {
            throw new AppError('VALIDATION_FAILED', undefined, {
              fields: [{ path: 'remixPartnerId', message: 'Choose another creator.' }],
            });
          }
        }
        const prompt = resolvePrompt(body.prompt, body.presetKey);

        await this.repo.lockShelf(tx, auth.creatorId);
        await this.repo.shiftShelfDown(tx, auth.creatorId);
        const project = await this.repo.createWithFirstPage(tx, {
          ownerId: auth.creatorId,
          title: prompt === undefined ? 'Untitled' : makeTitle(prompt),
          remixPartnerId: partnerId,
          lastEditedAt: new Date(),
        });
        const response: CreateProjectResponse = { project: toSummary(project) };
        if (prompt !== undefined) {
          const { set, job } = await this.createFirstSet(tx, auth, project.id, prompt, body, key!);
          response.set = set;
          response.job = job;
        }
        return { statusCode: 201, body: response };
      },
    );
  }

  private async createFirstSet(
    tx: Tx,
    auth: AuthContext,
    projectId: string,
    prompt: string,
    body: CreateProjectRequest,
    key: string,
  ): Promise<{ set: PromptSet; job: Job }> {
    const pageId = await this.repo.firstPageId(tx, projectId);
    const set = await this.repo.createPromptSet(tx, {
      projectId,
      pageId,
      prompt,
      presetKey: body.presetKey ?? null,
    });
    let job: { id: string };
    try {
      job = await this.repo.createCreateJob(tx, {
        projectId,
        setId: set.id,
        sessionId: auth.sessionId,
        idempotencyKey: key,
      });
    } catch (error) {
      // 멱등 기록은 24시간 뒤 지워지지만 작업 행은 남는다. 그 키를 다시 쓰면 충돌한다(전체 롤백).
      if (error instanceof JobKeyTakenError) throw new AppError('IDEMPOTENCY_KEY_REUSED');
      throw error;
    }
    return {
      set: { id: set.id, position: 1, prompt: set.prompt, latestAnswer: null, answers: [] },
      // 아직 아무 단계도 돌지 않았으므로 다음에 돌릴 단계는 시작 단계와 같다.
      job: {
        id: job.id,
        status: 'pending',
        startStage: 'analyze',
        nextStage: 'analyze',
        steps: [],
      },
    };
  }

  update(
    auth: AuthContext,
    id: string,
    body: UpdateProjectRequest,
  ): Promise<UpdateProjectResponse> {
    return this.repo.transaction(async (tx) => {
      const current = await this.requireOwned(tx, auth, id);
      if (body.title === undefined && body.shelfPosition === undefined) {
        return { project: toSummary(current) };
      }
      await this.repo.lockShelf(tx, auth.creatorId);
      const shelf = await this.repo.listShelf(tx, auth.creatorId);
      // 잠금을 기다리는 사이 다른 요청이 지웠을 수 있다.
      if (!shelf.some((item) => item.id === id)) throw new AppError('NOT_FOUND');

      if (body.shelfPosition !== undefined) {
        const order = planShelfOrder(
          shelf.map((item) => item.id),
          id,
          body.shelfPosition,
        );
        for (const change of shelfChanges(shelf, order)) {
          await this.repo.setShelfPosition(tx, change.id, change.shelfPosition);
        }
      }
      if (body.title !== undefined) {
        await this.repo.updateTitle(tx, id, body.title, new Date());
      }
      const updated = await this.repo.findById(tx, id);
      return { project: toSummary(updated!) };
    });
  }

  async remove(auth: AuthContext, id: string): Promise<void> {
    await this.repo.transaction(async (tx) => {
      await this.requireOwned(tx, auth, id);
      await this.repo.lockShelf(tx, auth.creatorId);
      const shelf = await this.repo.listShelf(tx, auth.creatorId);
      if (!shelf.some((item) => item.id === id)) throw new AppError('NOT_FOUND');
      await this.repo.softDelete(tx, id, new Date());
      const rest = shelf.filter((item) => item.id !== id);
      const order = rest.map((item) => item.id);
      for (const change of shelfChanges(rest, order)) {
        await this.repo.setShelfPosition(tx, change.id, change.shelfPosition);
      }
    });
  }

  /** 없거나 지워졌거나 숨겨졌으면 404, 남의 것이면 403 (이 순서). */
  private async requireOwned(tx: Tx, auth: AuthContext, id: string): Promise<ProjectRow> {
    const row = await this.repo.findById(tx, id);
    if (!row || row.deletedAt !== null || row.hiddenAt !== null) throw new AppError('NOT_FOUND');
    if (row.ownerId !== auth.creatorId) throw new AppError('FORBIDDEN');
    return row;
  }
}
