import { Injectable } from '@nestjs/common';
import type { CreateNodeCommentRequest, NodeComment } from '@tome/shared';
import { AppError } from '../../common';
import { EventsService } from '../events/events.service';
import { AnswersService } from '../generation/answers.service';
import { creatorAvatarUrl } from '../avatars/avatar-url';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { AuthContext } from '../session/auth.decorators';
import { type CommentRow, CommentsRepository } from './comments.repository';

function toComment(row: CommentRow, auth: AuthContext): NodeComment {
  return {
    id: row.id,
    nodeId: row.nodeId,
    author: {
      id: row.author.id,
      kind: row.author.kind,
      displayName: row.author.displayName,
      bio: row.author.bio,
      avatarUrl: creatorAvatarUrl(row.author),
    },
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    mine: row.authorId === auth.creatorId,
  };
}

/** 답변 nodes 스냅샷에 들어 있는 노드 id 들. */
function snapshotNodeIds(nodes: unknown): Set<string> {
  const list = (nodes as { nodes?: Array<{ id?: unknown }> } | null)?.nodes ?? [];
  return new Set(list.map((n) => n.id).filter((id): id is string => typeof id === 'string'));
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly repo: CommentsRepository,
    private readonly answers: AnswersService,
    private readonly events: EventsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(auth: AuthContext, answerId: string): Promise<{ comments: NodeComment[] }> {
    await this.answers.requireReadable(auth, answerId);
    const rows = await this.repo.listByAnswer(this.repo.client, answerId);
    return { comments: rows.map((row) => toComment(row, auth)) };
  }

  create(
    auth: AuthContext,
    key: string | undefined,
    answerId: string,
    body: CreateNodeCommentRequest,
  ) {
    return this.idempotency.run<{ comment: NodeComment }>(
      {
        sessionId: auth.sessionId,
        key,
        route: 'POST /answers/:id/comments',
        body: { answerId, ...body },
      },
      async (tx) => {
        const answer = await this.answers.requireReadable(auth, answerId);
        if (!snapshotNodeIds(answer.nodes).has(body.nodeId)) {
          throw new AppError('VALIDATION_FAILED', undefined, {
            fields: [{ path: 'nodeId', message: 'Node not found in this answer.' }],
          });
        }
        const row = await this.repo.create(tx, {
          answerId,
          nodeId: body.nodeId,
          authorId: auth.creatorId,
          body: body.body,
        });
        await this.events.recordServerEvent(tx, {
          type: 'comment_add',
          creatorId: auth.creatorId,
          sessionId: auth.sessionId,
          projectId: answer.set.projectId,
          setId: answer.setId,
          answerId,
          payload: { nodeId: body.nodeId },
        });
        return { statusCode: 201, body: { comment: toComment(row, auth) } };
      },
    );
  }

  async remove(auth: AuthContext, id: string): Promise<void> {
    const row = await this.repo.find(this.repo.client, id);
    if (!row || row.deletedAt !== null) throw new AppError('NOT_FOUND');
    if (row.authorId !== auth.creatorId) {
      // 읽을 수 없는 답변의 코멘트는 존재를 숨기고, 읽을 수 있으면 남의 것이라 403.
      await this.answers.requireReadable(auth, row.answerId);
      throw new AppError('FORBIDDEN');
    }
    const count = await this.repo.softDelete(this.repo.client, id);
    if (count === 0) throw new AppError('NOT_FOUND');
  }
}
