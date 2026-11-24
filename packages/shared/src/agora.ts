import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, LIMITS } from './common.js';
import { PromptSetSchema } from './answer.js';
import { DerivedFromSchema, ProjectKindSchema, ProjectSummarySchema } from './project.js';
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
  /** 첫 공개 게시가 최근인 창작자 순(아고라 Creator 탭의 New Creator, #214) */
  newCreators: z.array(CreatorSummarySchema),
  hotTopics: z.array(
    z.object({
      topic: TopicSchema,
      projects: z.array(AgoraProjectCardSchema),
      /** 이 주제의 공개 프로젝트 전체 수(projects 는 앞의 몇 개만 준다). 묶음의 "+N" 표시용(#214) */
      projectCount: z.number().int().min(0),
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

export const DeriveProjectResponseSchema = z.object({ project: ProjectSummarySchema });
export type DeriveProjectResponse = z.infer<typeof DeriveProjectResponseSchema>;

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

export const CreateAgoraCommentResponseSchema = z.object({ comment: AgoraCommentSchema });
export type CreateAgoraCommentResponse = z.infer<typeof CreateAgoraCommentResponseSchema>;

export const CommentListResponseSchema = z.object({
  comments: z.array(AgoraCommentSchema),
});
export type CommentListResponse = z.infer<typeof CommentListResponseSchema>;
