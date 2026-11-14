import { z } from 'zod';
import { IdSchema, LIMITS } from './common.js';
import {
  JobStageSchema,
  NodeIdSchema,
  NodeSchema,
  NodeSnapshotSchema,
  VerificationSchema,
} from './node.js';
import { AnswerSchema, PromptSetSchema } from './answer.js';
import { PresetKeySchema } from './presets.js';

export const JobStatusSchema = z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobStepStatusSchema = z.enum(['pending', 'running', 'succeeded', 'failed', 'skipped']);
export type JobStepStatus = z.infer<typeof JobStepStatusSchema>;

export const JobStepSchema = z.object({
  stage: JobStageSchema,
  status: JobStepStatusSchema,
  nodes: z.array(NodeSchema).optional(),
  answer: AnswerSchema.optional(),
  verification: VerificationSchema.optional(),
  provider: z.string().nullable(),
  fallbackUsed: z.boolean(),
});
export type JobStep = z.infer<typeof JobStepSchema>;

export const JobSchema = z.object({
  id: IdSchema,
  status: JobStatusSchema,
  startStage: JobStageSchema,
  nextStage: JobStageSchema.nullable(),
  steps: z.array(JobStepSchema.pick({ stage: true, status: true })),
});
export type Job = z.infer<typeof JobSchema>;

export const CreateSetRequestSchema = z.object({
  pageId: IdSchema,
  prompt: z.string().trim().min(1).max(LIMITS.PROMPT_MAX),
  attachmentId: IdSchema.optional(),
  presetKey: PresetKeySchema.optional(),
});
export type CreateSetRequest = z.infer<typeof CreateSetRequestSchema>;

export const CreateSetResponseSchema = z.object({
  set: PromptSetSchema,
  job: JobSchema,
});
export type CreateSetResponse = z.infer<typeof CreateSetResponseSchema>;

export const AdvanceJobRequestSchema = z.object({
  stage: JobStageSchema,
});
export type AdvanceJobRequest = z.infer<typeof AdvanceJobRequestSchema>;

export const AdvanceJobResponseSchema = z.object({
  job: JobSchema,
  step: JobStepSchema,
});
export type AdvanceJobResponse = z.infer<typeof AdvanceJobResponseSchema>;

export const GetJobResponseSchema = z.object({
  job: JobSchema,
  steps: z.array(JobStepSchema),
});
export type GetJobResponse = z.infer<typeof GetJobResponseSchema>;

export const CancelJobResponseSchema = z.object({
  job: JobSchema,
});
export type CancelJobResponse = z.infer<typeof CancelJobResponseSchema>;

export const CreateRevisionRequestSchema = z.object({
  baseAnswerId: IdSchema,
  nodes: NodeSnapshotSchema,
  appliedConnectionIds: z.array(IdSchema).optional(),
});
export type CreateRevisionRequest = z.infer<typeof CreateRevisionRequestSchema>;

export const CreateRevisionResponseSchema = z.object({
  job: JobSchema,
  startStage: JobStageSchema,
  changes: z.array(z.object({ nodeId: NodeIdSchema, field: z.string().min(1) })),
});
export type CreateRevisionResponse = z.infer<typeof CreateRevisionResponseSchema>;

export const AcceptAnswerResponseSchema = z.object({
  answer: z.object({
    id: IdSchema,
    number: z.number().int().positive(),
    status: z.literal('accepted'),
  }),
});
export type AcceptAnswerResponse = z.infer<typeof AcceptAnswerResponseSchema>;
