import { Injectable } from '@nestjs/common';
import type {
  CreateProjectRequest,
  CreateProjectResponse,
  FinishCandidatesResponse,
  FinishProjectRequest,
  FinishProjectResponse,
  Job,
  PostProjectRequest,
  PostProjectResponse,
  ProjectListResponse,
  ProjectSummary,
  PromptSet,
  UpdateProjectRequest,
  UpdateProjectResponse,
} from '@tome/shared';
import { AppError } from '../../common';
import { EventsService } from '../events/events.service';
import { toAnswerSummary } from '../generation/generation.mappers';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { InputSafetyService, isValidKey } from './input-safety.service';
import { UsageService } from '../usage/usage.service';
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
    private readonly usage: UsageService,
    private readonly events: EventsService,
    private readonly safety: InputSafetyService,
  ) {}

  async list(auth: AuthContext): Promise<ProjectListResponse> {
    const rows = await this.repo.listVisible(auth.creatorId, SHELF_LIMIT);
    // 관리자가 숨긴 프로젝트 자리가 비어도 보이는 것만 0..n-1 로 보여 준다.
    return { projects: rows.map((row, index) => toSummary({ ...row, shelfPosition: index })) };
  }

  /** 어느 창작자의 게시작(남에게 보여 줄 수 있는 것만). */
  async listPosted(ownerId: string): Promise<ProjectSummary[]> {
    const rows = await this.repo.listPosted(ownerId, SHELF_LIMIT);
    return rows.map((row, index) => toSummary({ ...row, shelfPosition: index }));
  }

  async create(auth: AuthContext, key: string | undefined, body: CreateProjectRequest) {
    // 입력 안전 검사는 DB 트랜잭션 밖에서 한다. 같은 키로 이미 만든 작업이 있으면(재생) 다시 검사하지 않는다.
    const checked = resolvePrompt(body.prompt, body.presetKey);
    if (
      checked !== undefined &&
      body.attachmentId === undefined &&
      isValidKey(key) &&
      !(await this.repo.jobKeyExists(auth.sessionId, key))
    ) {
      await this.safety.assertSafe(checked);
    }
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
        // 세트·job 을 만들기 전에 상한을 본다. 프리셋 그대로면 통과(advance 가 대체 결과로 채운다).
        if (prompt !== undefined) {
          await this.usage.assertWithinLimitsOrSample(body.presetKey, prompt);
        }

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
        setId: set.id,
        pageId,
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

  /** 완료 후보: 핀한 확정 답변, 핀이 하나도 없으면 확정 답변 전부. */
  async finishCandidates(auth: AuthContext, id: string): Promise<FinishCandidatesResponse> {
    await this.repo.transaction(async (tx) => this.requireOwned(tx, auth, id));
    const accepted = await this.repo.listAcceptedAnswers(this.repo.client, id);
    const pinned = accepted.filter((answer) => answer.pinned);
    return { answers: (pinned.length > 0 ? pinned : accepted).map(toAnswerSummary) };
  }

  /** 완료. 다시 완료하면 대표·제목·이유를 갱신하고 완료 시각도 새로 찍는다(게시작 스냅샷 시점). */
  finish(auth: AuthContext, key: string | undefined, id: string, body: FinishProjectRequest) {
    return this.idempotency.run<FinishProjectResponse>(
      { sessionId: auth.sessionId, key, route: `POST /projects/${id}/finish`, body },
      async (tx) => {
        await this.repo.lockProject(tx, id);
        await this.requireOwned(tx, auth, id);
        const accepted = await this.repo.listAcceptedAnswers(tx, id);
        if (accepted.length === 0) throw new AppError('NOT_FINISHABLE');
        if (!accepted.some((answer) => answer.id === body.coverAnswerId)) {
          throw new AppError('VALIDATION_FAILED', undefined, {
            fields: [
              { path: 'coverAnswerId', message: 'Choose one of the versions in this project.' },
            ],
          });
        }
        await this.repo.saveFinish(tx, id, {
          title: body.title,
          coverAnswerId: body.coverAnswerId,
          selectionReason: body.reason ?? null,
          now: new Date(),
        });
        await this.events.recordServerEvent(tx, {
          type: 'project_finish',
          creatorId: auth.creatorId,
          sessionId: auth.sessionId,
          projectId: id,
          answerId: body.coverAnswerId,
        });
        const updated = await this.repo.findById(tx, id);
        return { statusCode: 200, body: { project: toSummary(updated!) } };
      },
    );
  }

  /** 게시 토글. 켜기는 완료된 프로젝트만. 상태가 바뀔 때만 시각과 이벤트를 남긴다. */
  setPosted(auth: AuthContext, id: string, body: PostProjectRequest): Promise<PostProjectResponse> {
    return this.repo.transaction(async (tx) => {
      await this.repo.lockProject(tx, id);
      const project = await this.requireOwned(tx, auth, id);
      const wasPosted = project.postedAt !== null;
      if (body.posted && project.status !== 'finished') throw new AppError('NOT_FINISHED');
      if (body.posted === wasPosted) {
        return { postedAt: project.postedAt?.toISOString() ?? null };
      }
      const postedAt = body.posted ? new Date() : null;
      await this.repo.savePostedAt(tx, id, postedAt);
      await this.events.recordServerEvent(tx, {
        type: 'project_post',
        creatorId: auth.creatorId,
        sessionId: auth.sessionId,
        projectId: id,
        payload: { posted: body.posted },
      });
      return { postedAt: postedAt?.toISOString() ?? null };
    });
  }

  /** 다른 모듈(워크스페이스)용: 내 프로젝트의 요약. 없음·삭제·숨김 404, 남의 것 403. */
  getOwnedSummary(auth: AuthContext, id: string): Promise<ProjectSummary> {
    return this.repo.transaction(async (tx) => toSummary(await this.requireOwned(tx, auth, id)));
  }

  /** 없거나 지워졌거나 숨겨졌으면 404, 남의 것이면 403 (이 순서). */
  private async requireOwned(tx: Tx, auth: AuthContext, id: string): Promise<ProjectRow> {
    const row = await this.repo.findById(tx, id);
    if (!row || row.deletedAt !== null || row.hiddenAt !== null) throw new AppError('NOT_FOUND');
    if (row.ownerId !== auth.creatorId) throw new AppError('FORBIDDEN');
    return row;
  }
}
