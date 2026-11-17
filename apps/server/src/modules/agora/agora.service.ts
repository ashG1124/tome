import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  AgoraComment,
  AgoraHomeResponse,
  AgoraProjectCard,
  AgoraProjectResponse,
  CommentListResponse,
  CreateAgoraCommentRequest,
  CreatorSummary,
  DerivedFrom,
  ProjectSummary,
  PromptSet,
  Topic,
  TopicResponse,
} from '@tome/shared';
import { AppError } from '../../common';
import type { Prisma } from '../../generated/prisma/client';
import { OBJECT_STORAGE, type ObjectStorage, answerImageKey } from '../../storage';
import { EventsService } from '../events/events.service';
import { AnswersService } from '../generation/answers.service';
import { answerImageUrl, toAnswer, toAnswerSummary } from '../generation/generation.mappers';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { ProjectsService } from '../projects/projects.service';
import type { AuthContext } from '../session/auth.decorators';
import {
  DERIVATIVE_LIMIT,
  HOT_TOPIC_LIMIT,
  HOT_TOPIC_PROJECT_LIMIT,
  RECOMMENDED_LIMIT,
  RISING_LIMIT,
  TOPIC_PROJECT_LIMIT,
  type CreatorScore,
  mimeOfKey,
  rankCreators,
  rankProjects,
  scoreOf,
  utcDayRange,
} from './agora.rules';
import {
  type AgoraCommentRow,
  AgoraRepository,
  type CardRow,
  type DetailRow,
  type Db,
} from './agora.repository';

interface CreatorLike {
  id: string;
  kind: CreatorSummary['kind'];
  displayName: string;
  bio: string | null;
}

const toCreator = (c: CreatorLike): CreatorSummary => ({
  id: c.id,
  kind: c.kind,
  displayName: c.displayName,
  bio: c.bio,
  avatarUrl: null,
});

const isPublicProject = (p: {
  postedAt: Date | null;
  deletedAt: Date | null;
  hiddenAt: Date | null;
}) => p.postedAt !== null && p.deletedAt === null && p.hiddenAt === null;

function toComment(row: AgoraCommentRow, auth: AuthContext): AgoraComment {
  return {
    id: row.id,
    author: toCreator(row.author),
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    mine: row.authorId === auth.creatorId,
  };
}

@Injectable()
export class AgoraService {
  constructor(
    private readonly repo: AgoraRepository,
    private readonly answers: AnswersService,
    private readonly projects: ProjectsService,
    private readonly events: EventsService,
    private readonly idempotency: IdempotencyService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  // ---- 홈·토픽 ----

  async home(): Promise<AgoraHomeResponse> {
    const db = this.repo.client;
    const rows = await this.repo.listPublic(db);
    const ranked = this.rank(rows);
    const counts = await this.repo.commentCounts(
      db,
      rows.map((r) => r.id),
    );
    const card = (row: CardRow) => this.toCard(row, counts);

    const topics = await this.repo.listTopics(db);
    const hotTopics = topics
      .map((topic) => ({
        topic: { id: topic.id, title: topic.title } satisfies Topic,
        projects: ranked.filter((r) => r.topicId === topic.id),
      }))
      .filter((entry) => entry.projects.length > 0)
      .slice(0, HOT_TOPIC_LIMIT)
      .map((entry) => ({
        topic: entry.topic,
        projects: entry.projects.slice(0, HOT_TOPIC_PROJECT_LIMIT).map(card),
      }));

    return {
      recommended: ranked.slice(0, RECOMMENDED_LIMIT).map(card),
      risingCreators: await this.listRisingCreators({ limit: RISING_LIMIT }),
      hotTopics,
    };
  }

  async topic(id: string): Promise<TopicResponse> {
    const db = this.repo.client;
    const topic = await this.repo.findTopic(db, id);
    if (!topic) throw new AppError('NOT_FOUND');
    const rows = this.rank(await this.repo.listPublic(db, { topicId: id })).slice(
      0,
      TOPIC_PROJECT_LIMIT,
    );
    const counts = await this.repo.commentCounts(
      db,
      rows.map((r) => r.id),
    );
    return {
      topic: { id: topic.id, title: topic.title },
      projects: rows.map((r) => this.toCard(r, counts)),
    };
  }

  /**
   * 라이징 크리에이터 순위(공개 프로젝트가 1개 이상인 창작자). 리믹스 후보 목록도 이 함수를 부른다.
   * 규칙은 agora.rules.ts 의 rankCreators.
   */
  async listRisingCreators(opts: {
    limit: number;
    excludeCreatorId?: string;
  }): Promise<CreatorSummary[]> {
    const rows = await this.repo.listPublic(this.repo.client);
    const byCreator = new Map<string, CreatorScore & { creator: CreatorLike }>();
    for (const row of rows) {
      if (row.owner.id === opts.excludeCreatorId) continue;
      const postedAt = row.postedAt!;
      const entry = byCreator.get(row.owner.id);
      const score = scoreOf(row.stat);
      if (!entry) {
        byCreator.set(row.owner.id, {
          creatorId: row.owner.id,
          seedOrder: row.owner.seedOrder,
          score,
          latestPostedAt: postedAt,
          creator: row.owner,
        });
      } else {
        entry.score += score;
        if (postedAt > entry.latestPostedAt) entry.latestPostedAt = postedAt;
      }
    }
    return rankCreators([...byCreator.values()])
      .slice(0, opts.limit)
      .map((entry) => toCreator(entry.creator));
  }

  // ---- 상세 ----

  async getProject(id: string): Promise<AgoraProjectResponse> {
    const db = this.repo.client;
    const detail = await this.requirePublic(db, id);
    const derivativeRows = (await this.repo.listPublic(db, { derivedFromProjectId: id }))
      .sort(
        (a, b) =>
          b.postedAt!.getTime() - a.postedAt!.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
      )
      .slice(0, DERIVATIVE_LIMIT);
    const counts = await this.repo.commentCounts(db, [id, ...derivativeRows.map((r) => r.id)]);

    const response: AgoraProjectResponse = {
      project: this.toCard(detail, counts),
      author: toCreator(detail.owner),
      coverImageUrl: detail.coverAnswerId ? answerImageUrl(detail.coverAnswerId) : null,
      sets: await this.coverSets(db, detail),
      commentCount: counts.get(id) ?? 0,
      derivatives: derivativeRows.map((r) => this.toCard(r, counts)),
    };
    if (detail.selectionReason) response.reason = detail.selectionReason;
    const derivedFrom = this.toDerivedFrom(detail);
    if (derivedFrom) response.derivedFrom = derivedFrom;
    return response;
  }

  private async coverSets(db: Db, detail: DetailRow): Promise<PromptSet[]> {
    if (!detail.coverAnswerId) return [];
    const set = await this.repo.findSetOfAnswer(db, detail.coverAnswerId);
    if (!set || set.projectId !== detail.id) return [];
    const visible = set.answers.filter((a) => this.answers.isPublic(detail, a));
    if (visible.length === 0) return [];
    const latest = visible[visible.length - 1]!;
    return [
      {
        id: set.id,
        position: set.position,
        prompt: set.prompt,
        latestAnswer: toAnswer(latest),
        answers: visible.map(toAnswerSummary),
      },
    ];
  }

  /** 원작이 삭제·숨김·미게시면 제목·답변 없이 id 만 돌려 화면이 "Deleted original" 을 그리게 한다. */
  private toDerivedFrom(detail: DetailRow): DerivedFrom | null {
    if (!detail.derivedFromProjectId) return null;
    const original = detail.derivedFrom;
    if (original && isPublicProject(original)) {
      return {
        projectId: original.id,
        answerId: detail.derivedFromAnswerId,
        title: original.title,
      };
    }
    return { projectId: detail.derivedFromProjectId, answerId: null, title: null };
  }

  // ---- 조회 ----

  /** 같은 세션·프로젝트·UTC 날짜에 한 번만 센다. */
  async recordView(auth: AuthContext, id: string): Promise<void> {
    await this.repo.transaction(async (tx) => {
      await this.repo.lockView(tx, auth.sessionId, id);
      await this.requirePublic(tx, id);
      if (await this.repo.hasViewEvent(tx, auth.sessionId, id, utcDayRange(new Date()))) return;
      await this.events.recordServerEvent(tx, {
        type: 'project_view',
        creatorId: auth.creatorId,
        sessionId: auth.sessionId,
        projectId: id,
      });
      await this.repo.bumpStat(tx, id, 'viewCount');
    });
  }

  // ---- 파생 ----

  async derive(auth: AuthContext, key: string | undefined, id: string) {
    let pending: string[] = [];
    try {
      return await this.idempotency.run<{ project: ProjectSummary }>(
        {
          sessionId: auth.sessionId,
          key,
          route: 'POST /agora/projects/:id/derive',
          body: { projectId: id },
        },
        async (tx) => {
          const uploaded: string[] = [];
          try {
            const body = await this.deriveInTx(tx, auth, id, uploaded);
            pending = uploaded;
            return { statusCode: 201, body };
          } catch (error) {
            await this.deleteQuietly(uploaded);
            throw error;
          }
        },
      );
    } catch (error) {
      // 일은 끝났는데 커밋이 실패한 경우에도 새로 올린 객체를 남기지 않는다.
      await this.deleteQuietly(pending);
      throw error;
    }
  }

  private async deriveInTx(
    tx: Prisma.TransactionClient,
    auth: AuthContext,
    id: string,
    uploaded: string[],
  ): Promise<{ project: ProjectSummary }> {
    const source = await this.repo.findDetail(tx, id);
    if (!source) throw new AppError('NOT_FOUND');
    if (!isPublicProject(source) || !source.coverAnswerId) {
      throw new AppError('DERIVE_SOURCE_UNAVAILABLE');
    }
    const cover = await this.repo.findAnswer(tx, source.coverAnswerId);
    if (!cover || cover.set.projectId !== id || !this.answers.isPublic(source, cover)) {
      throw new AppError('DERIVE_SOURCE_UNAVAILABLE');
    }

    // 이미지 바이트를 새 답변 키로 복사한다(원작 객체를 공유하지 않는다).
    const newId = randomUUID();
    const mime = mimeOfKey(cover.imageKey);
    const imageKey = answerImageKey(newId, 'full', mime);
    const bytes = await this.storage.get(cover.imageKey);
    await this.storage.put(imageKey, bytes, mime);
    uploaded.push(imageKey);
    let thumbKey: string | null = null;
    if (cover.thumbKey) {
      thumbKey = answerImageKey(newId, 'thumb');
      await this.storage.put(thumbKey, await this.storage.get(cover.thumbKey), 'image/jpeg');
      uploaded.push(thumbKey);
    }

    const created = await this.projects.createDerived(tx, auth, {
      title: source.title,
      derivedFromProjectId: id,
      derivedFromAnswerId: cover.id,
    });
    const set = await this.repo.createSet(tx, {
      projectId: created.project.id,
      pageId: created.pageId,
      prompt: cover.set.prompt,
      presetKey: cover.set.presetKey,
    });
    await this.repo.createAnswer(tx, {
      id: newId,
      setId: set.id,
      status: 'accepted',
      acceptedAt: new Date(),
      number: 1,
      origin: 'derived_copy',
      imageKey,
      thumbKey,
      imageMode: cover.imageMode,
      assembledPrompt: cover.assembledPrompt,
      phrases: cover.phrases as Prisma.InputJsonValue,
      excluded: cover.excluded as Prisma.InputJsonValue,
      nodes: cover.nodes as Prisma.InputJsonValue,
      verification:
        cover.verification === null ? undefined : (cover.verification as Prisma.InputJsonValue),
      provider: cover.provider,
      model: cover.model,
      isSample: cover.isSample,
      sampleResultId: cover.sampleResultId,
      copiedFromAnswerId: cover.id,
      createdById: auth.creatorId,
    });
    await this.repo.bumpStat(tx, id, 'deriveCount');
    await this.events.recordServerEvent(tx, {
      type: 'derive_start',
      creatorId: auth.creatorId,
      sessionId: auth.sessionId,
      projectId: created.project.id,
      setId: set.id,
      answerId: newId,
      payload: { sourceProjectId: id, sourceAnswerId: cover.id },
    });
    return { project: created.project };
  }

  private async deleteQuietly(keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.storage.delete(key);
      } catch {
        // 지우지 못해도 고아 객체일 뿐이다.
      }
    }
  }

  // ---- 댓글 ----

  async listComments(
    auth: AuthContext,
    projectId: string,
    query: { before?: string; limit: number },
  ): Promise<CommentListResponse> {
    const db = this.repo.client;
    await this.requirePublic(db, projectId);
    let cursor: { createdAt: Date; id: string } | null = null;
    if (query.before !== undefined) {
      const found = await this.repo.findCommentCursor(db, query.before);
      if (!found || found.projectId !== projectId) {
        throw new AppError('VALIDATION_FAILED', undefined, {
          fields: [{ path: 'before', message: 'Unknown comment.' }],
        });
      }
      cursor = found;
    }
    const rows = await this.repo.listComments(db, projectId, cursor, query.limit);
    return { comments: rows.map((row) => toComment(row, auth)) };
  }

  createComment(
    auth: AuthContext,
    key: string | undefined,
    projectId: string,
    body: CreateAgoraCommentRequest,
  ) {
    return this.idempotency.run<{ comment: AgoraComment }>(
      {
        sessionId: auth.sessionId,
        key,
        route: 'POST /projects/:id/comments',
        body: { projectId, ...body },
      },
      async (tx) => {
        await this.requirePublic(tx, projectId);
        const row = await this.repo.createComment(tx, {
          projectId,
          authorId: auth.creatorId,
          body: body.body,
        });
        await this.events.recordServerEvent(tx, {
          type: 'comment_add',
          creatorId: auth.creatorId,
          sessionId: auth.sessionId,
          projectId,
          payload: { target: 'agora' },
        });
        return { statusCode: 201, body: { comment: toComment(row, auth) } };
      },
    );
  }

  async removeComment(auth: AuthContext, id: string): Promise<void> {
    const db = this.repo.client;
    const row = await this.repo.findComment(db, id);
    if (!row || row.deletedAt !== null || row.hiddenAt !== null) throw new AppError('NOT_FOUND');
    if (row.authorId !== auth.creatorId) {
      // 공개되지 않은 프로젝트의 댓글은 존재를 숨기고, 보이면 남의 것이라 403.
      await this.requirePublic(db, row.projectId);
      throw new AppError('FORBIDDEN');
    }
    const count = await this.repo.softDeleteComment(db, id);
    if (count === 0) throw new AppError('NOT_FOUND');
  }

  // ---- 공통 ----

  private async requirePublic(db: Db, id: string): Promise<DetailRow> {
    const row = await this.repo.findDetail(db, id);
    if (!row || !isPublicProject(row)) throw new AppError('NOT_FOUND');
    return row;
  }

  private rank(rows: CardRow[]): Array<CardRow & { score: number; postedAt: Date }> {
    return rankProjects(rows.map((r) => ({ ...r, postedAt: r.postedAt!, score: scoreOf(r.stat) })));
  }

  private toCard(row: CardRow, counts: Map<string, number>): AgoraProjectCard {
    return {
      id: row.id,
      title: row.title,
      kind: row.kind,
      author: toCreator(row.owner),
      coverThumbUrl: row.coverAnswerId ? `/assets/answers/${row.coverAnswerId}/thumb` : null,
      likeCount: row.stat?.likeCount ?? 0,
      commentCount: counts.get(row.id) ?? 0,
    };
  }
}
