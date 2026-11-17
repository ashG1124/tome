import { describe, expect, it } from 'vitest';
import {
  AgoraCommentSchema,
  AgoraHomeResponseSchema,
  AgoraProjectCardSchema,
  AgoraProjectResponseSchema,
  CommentListResponseSchema,
  CreateAgoraCommentRequestSchema,
  TopicResponseSchema,
  TopicSchema,
} from './agora.js';
import { LIMITS } from './common.js';
import { ID_A, ID_B, NOW, creator } from './testing/fixtures.js';

const card = {
  id: ID_A,
  title: 'Neon stage',
  kind: 'original',
  author: creator,
  coverThumbUrl: null,
  likeCount: 3,
  commentCount: 0,
};
const topic = { id: ID_B, title: 'Make a cozy reading space' };

describe('agora schemas', () => {
  it('parses a card and rejects negative counts', () => {
    expect(AgoraProjectCardSchema.safeParse(card).success).toBe(true);
    expect(AgoraProjectCardSchema.safeParse({ ...card, likeCount: -1 }).success).toBe(false);
  });

  it('limits topic titles to 80', () => {
    const title = (n: number) => TopicSchema.safeParse({ ...topic, title: 'a'.repeat(n) }).success;
    expect(title(LIMITS.TOPIC_TITLE_MAX)).toBe(true);
    expect(title(LIMITS.TOPIC_TITLE_MAX + 1)).toBe(false);
  });

  it('parses the home and topic responses', () => {
    const home = {
      recommended: [card],
      risingCreators: [creator],
      hotTopics: [{ topic, projects: [card] }],
    };
    expect(AgoraHomeResponseSchema.safeParse(home).success).toBe(true);
    expect(TopicResponseSchema.safeParse({ topic, projects: [card] }).success).toBe(true);
    expect(AgoraHomeResponseSchema.safeParse({ ...home, recommended: [{}] }).success).toBe(false);
  });

  it('parses a project response with optional parts omitted', () => {
    const res = {
      project: card,
      author: creator,
      coverImageUrl: null,
      sets: [],
      commentCount: 0,
      derivatives: [],
    };
    const reason = (n: number) =>
      AgoraProjectResponseSchema.safeParse({ ...res, reason: 'a'.repeat(n) }).success;
    expect(AgoraProjectResponseSchema.safeParse(res).success).toBe(true);
    expect(reason(LIMITS.REASON_MAX)).toBe(true);
    expect(reason(LIMITS.REASON_MAX + 1)).toBe(false);
  });

  it('limits comment bodies to 300', () => {
    const body = (n: number) => CreateAgoraCommentRequestSchema.safeParse({ body: 'a'.repeat(n) });
    expect(body(LIMITS.COMMENT_MAX).success).toBe(true);
    expect(body(LIMITS.COMMENT_MAX + 1).success).toBe(false);
    expect(body(0).success).toBe(false);
  });

  it('parses comments and comment lists', () => {
    const comment = { id: ID_A, author: creator, body: 'nice', createdAt: NOW, mine: false };
    expect(AgoraCommentSchema.safeParse(comment).success).toBe(true);
    expect(CommentListResponseSchema.safeParse({ comments: [comment] }).success).toBe(true);
  });
});
