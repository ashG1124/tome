import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, LIMITS } from './common.js';
import { NodeIdSchema, NodeSnapshotSchema, VerificationSchema } from './node.js';
import { CreatorSummarySchema } from './session.js';

export const AnswerStatusSchema = z.enum(['draft', 'accepted', 'discarded']);
export type AnswerStatus = z.infer<typeof AnswerStatusSchema>;

export const AnswerOriginSchema = z.enum(['generated', 'edited', 'sample', 'derived_copy', 'seed']);
export type AnswerOrigin = z.infer<typeof AnswerOriginSchema>;

export const ImageModeSchema = z.enum(['generate', 'edit']);
export type ImageMode = z.infer<typeof ImageModeSchema>;

export const AnswerSummarySchema = z.object({
  id: IdSchema,
  number: z.number().int().positive().nullable(),
  pinned: z.boolean(),
  isSample: z.boolean(),
  thumbUrl: z.string(),
  createdAt: IsoDateTimeSchema,
});
export type AnswerSummary = z.infer<typeof AnswerSummarySchema>;

export const AnswerSchema = AnswerSummarySchema.extend({
  setId: IdSchema,
  status: AnswerStatusSchema,
  origin: AnswerOriginSchema,
  imageMode: ImageModeSchema,
  baseAnswerId: IdSchema.nullable(),
  imageUrl: z.string(),
  nodes: NodeSnapshotSchema,
  verification: VerificationSchema.nullable(),
});
export type Answer = z.infer<typeof AnswerSchema>;

export const GetAnswerResponseSchema = z.object({
  answer: AnswerSchema,
});
export type GetAnswerResponse = z.infer<typeof GetAnswerResponseSchema>;

export const PromptSetSchema = z.object({
  id: IdSchema,
  position: z.number().int().min(1).max(LIMITS.SETS_PER_PAGE),
  prompt: z.string().min(1).max(LIMITS.PROMPT_MAX),
  latestAnswer: AnswerSchema.nullable(),
  answers: z.array(AnswerSummarySchema),
});
export type PromptSet = z.infer<typeof PromptSetSchema>;

export const PinAnswerRequestSchema = z.object({
  pinned: z.boolean(),
});
export type PinAnswerRequest = z.infer<typeof PinAnswerRequestSchema>;

export const UpdateVerificationRequestSchema = z.object({
  nodes: z.array(
    z
      .object({
        id: NodeIdSchema,
        enabled: z.boolean().optional(),
        decision: z.enum(['kept', 'removed']).optional(),
      })
      .refine((n) => (n.enabled === undefined) !== (n.decision === undefined), {
        message: 'Provide exactly one of enabled or decision',
      }),
  ),
});
export type UpdateVerificationRequest = z.infer<typeof UpdateVerificationRequestSchema>;

export const NodeCommentSchema = z.object({
  id: IdSchema,
  nodeId: NodeIdSchema,
  author: CreatorSummarySchema,
  body: z.string().min(1).max(LIMITS.COMMENT_MAX),
  createdAt: IsoDateTimeSchema,
  mine: z.boolean(),
});
export type NodeComment = z.infer<typeof NodeCommentSchema>;

export const CreateNodeCommentRequestSchema = z.object({
  nodeId: NodeIdSchema,
  body: z.string().trim().min(1).max(LIMITS.COMMENT_MAX),
});
export type CreateNodeCommentRequest = z.infer<typeof CreateNodeCommentRequestSchema>;
