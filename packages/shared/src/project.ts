import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, LIMITS } from './common.js';
import { AnswerSummarySchema, PromptSetSchema } from './answer.js';
import { JobSchema } from './generation.js';
import { PageWithCountSchema } from './page.js';
import { PresetKeySchema } from './presets.js';
import { RemixStateSchema } from './remix.js';
import { CreatorSummarySchema } from './session.js';

export const ProjectKindSchema = z.enum(['original', 'derive']);
export type ProjectKind = z.infer<typeof ProjectKindSchema>;

export const ProjectStatusSchema = z.enum(['building', 'finished']);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectSummarySchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(LIMITS.TITLE_MAX),
  status: ProjectStatusSchema,
  posted: z.boolean(),
  coverThumbUrl: z.string().nullable(),
  lastEditedAt: IsoDateTimeSchema,
  shelfPosition: z.number().int().min(0),
  kind: ProjectKindSchema,
  remixPartner: CreatorSummarySchema.optional(),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export const ProjectListResponseSchema = z.object({
  projects: z.array(ProjectSummarySchema),
});
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;

export const CreateProjectRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(LIMITS.PROMPT_MAX).optional(),
  remixPartnerId: IdSchema.optional(),
  attachmentId: IdSchema.optional(),
  presetKey: PresetKeySchema.optional(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const CreateProjectResponseSchema = z.object({
  project: ProjectSummarySchema,
  set: PromptSetSchema.optional(),
  job: JobSchema.optional(),
});
export type CreateProjectResponse = z.infer<typeof CreateProjectResponseSchema>;

export const UpdateProjectRequestSchema = z.object({
  title: z.string().trim().min(1).max(LIMITS.TITLE_MAX).optional(),
  shelfPosition: z.number().int().min(0).optional(),
});
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;

export const WorkspaceResponseSchema = z.object({
  project: ProjectSummarySchema,
  pages: z.array(PageWithCountSchema),
  currentPageId: IdSchema,
  sets: z.array(PromptSetSchema),
  activeJob: JobSchema.optional(),
  remix: RemixStateSchema.optional(),
});
export type WorkspaceResponse = z.infer<typeof WorkspaceResponseSchema>;

export const FinishCandidatesResponseSchema = z.object({
  answers: z.array(AnswerSummarySchema),
});
export type FinishCandidatesResponse = z.infer<typeof FinishCandidatesResponseSchema>;

export const FinishProjectRequestSchema = z.object({
  title: z.string().trim().min(1).max(LIMITS.TITLE_MAX),
  coverAnswerId: IdSchema,
  reason: z.string().max(LIMITS.REASON_MAX).optional(),
});
export type FinishProjectRequest = z.infer<typeof FinishProjectRequestSchema>;

export const PostProjectRequestSchema = z.object({
  posted: z.boolean(),
});
export type PostProjectRequest = z.infer<typeof PostProjectRequestSchema>;

export const PostProjectResponseSchema = z.object({
  postedAt: IsoDateTimeSchema.nullable(),
});
export type PostProjectResponse = z.infer<typeof PostProjectResponseSchema>;

export const DerivedFromSchema = z.object({
  projectId: IdSchema,
  answerId: IdSchema.nullable(),
  title: z.string().nullable(),
});
export type DerivedFrom = z.infer<typeof DerivedFromSchema>;
