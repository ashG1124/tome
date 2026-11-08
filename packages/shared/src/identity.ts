import { z } from 'zod';
import { IsoDateTimeSchema, LIMITS } from './common.js';
import { ProjectSummarySchema } from './project.js';
import { CreatorSummarySchema } from './session.js';

const AxisScoreSchema = z.number().min(LIMITS.AXIS_SCORE_MIN).max(LIMITS.AXIS_SCORE_MAX).nullable();
const CountSchema = z.number().int().min(0);

export const IdentityAxesSchema = z.object({
  scaleIntensity: AxisScoreSchema,
  aiRelation: AxisScoreSchema,
  decisionBasis: AxisScoreSchema,
  direction: AxisScoreSchema,
});
export type IdentityAxes = z.infer<typeof IdentityAxesSchema>;

export const IdentityMetricsSchema = z.object({
  sessions: CountSchema,
  nodeEdits: CountSchema,
  reasonedRatio: z.number().min(0).max(1),
  firstRecordedAt: IsoDateTimeSchema.nullable(),
  lastActiveAt: IsoDateTimeSchema.nullable(),
  originBreakdown: z.object({
    own: CountSchema,
    remix: CountSchema,
    derived: CountSchema,
  }),
});
export type IdentityMetrics = z.infer<typeof IdentityMetricsSchema>;

export const IdentitySnapshotSchema = z.object({
  algoVersion: z.string().min(1),
  axes: IdentityAxesSchema,
  metrics: IdentityMetricsSchema,
  eventCount: CountSchema,
  projectCount: CountSchema,
  provisional: z.boolean(),
  computedAt: IsoDateTimeSchema,
});
export type IdentitySnapshot = z.infer<typeof IdentitySnapshotSchema>;

export const IdentityTableRowSchema = z.object({
  axis: IdentityAxesSchema.keyof(),
  score: AxisScoreSchema,
});
export type IdentityTableRow = z.infer<typeof IdentityTableRowSchema>;

export const IdentityResponseSchema = z.object({
  snapshot: IdentitySnapshotSchema,
  table: z.array(IdentityTableRowSchema),
});
export type IdentityResponse = z.infer<typeof IdentityResponseSchema>;

export const CompareEntrySchema = z.object({
  creator: CreatorSummarySchema,
  axes: IdentityAxesSchema,
  provisional: z.boolean(),
});
export type CompareEntry = z.infer<typeof CompareEntrySchema>;

export const CompareResponseSchema = z.object({
  me: CompareEntrySchema,
  others: z.array(CompareEntrySchema),
});
export type CompareResponse = z.infer<typeof CompareResponseSchema>;

export const CreatorProfileResponseSchema = z.object({
  creator: CreatorSummarySchema,
  works: z.array(ProjectSummarySchema),
  identity: IdentitySnapshotSchema.nullable(),
});
export type CreatorProfileResponse = z.infer<typeof CreatorProfileResponseSchema>;
