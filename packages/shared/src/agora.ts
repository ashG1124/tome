import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, LIMITS } from './common.js';
import { PromptSetSchema } from './answer.js';
import { DerivedFromSchema, ProjectKindSchema } from './project.js';
import { CreatorSummarySchema } from './session.js';

export const AgoraProjectCardSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(LIMITS.TITLE_MAX),
  kind: ProjectKindSchema,
  author: CreatorSummarySchema,
  coverThumbUrl: z.string().nullable(),
  likeCount: z.number().int().min(0),
  commentCount: z.number().int().min(0),
});
export type AgoraProjectCard = z.infer<typeof AgoraProjectCardSchema>;

export const TopicSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(LIMITS.TOPIC_TITLE_MAX),
});
export type Topic = z.infer<typeof TopicSchema>;

export const AgoraHomeResponseSchema = z.object({
  recommended: z.array(AgoraProjectCardSchema),
  risingCreators: z.array(CreatorSummarySchema),
  hotTopics: z.array(
    z.object({
      topic: TopicSchema,
      projects: z.array(AgoraProjectCardSchema),
    }),
  ),
});
export type AgoraHomeResponse = z.infer<typeof AgoraHomeResponseSchema>;

export const TopicResponseSchema = z.object({
  topic: TopicSchema,
  projects: z.array(AgoraProjectCardSchema),
});
export type TopicResponse = z.infer<typeof TopicResponseSchema>;

export const AgoraProjectResponseSchema = z.object({
  project: AgoraProjectCardSchema,
  author: CreatorSummarySchema,
  coverImageUrl: z.string().nullable(),
  reason: z.string().max(LIMITS.REASON_MAX).optional(),
  sets: z.array(PromptSetSchema),
  commentCount: z.number().int().min(0),
  derivatives: z.array(AgoraProjectCardSchema),
  derivedFrom: DerivedFromSchema.optional(),
});
export type AgoraProjectResponse = z.infer<typeof AgoraProjectResponseSchema>;

export const AgoraCommentSchema = z.object({
  id: IdSchema,
  author: CreatorSummarySchema,
  body: z.string().min(1).max(LIMITS.COMMENT_MAX),
  createdAt: IsoDateTimeSchema,
  mine: z.boolean(),
});
export type AgoraComment = z.infer<typeof AgoraCommentSchema>;

export const CreateAgoraCommentRequestSchema = z.object({
  body: z.string().trim().min(1).max(LIMITS.COMMENT_MAX),
});
export type CreateAgoraCommentRequest = z.infer<typeof CreateAgoraCommentRequestSchema>;

export const CommentListResponseSchema = z.object({
  comments: z.array(AgoraCommentSchema),
});
export type CommentListResponse = z.infer<typeof CommentListResponseSchema>;
