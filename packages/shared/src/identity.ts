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
  // 이유를 남길 수 있는 편집이 5개 미만이면 null(화면은 "—").
  reasonedRatio: z.number().min(0).max(1).nullable(),
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

/** 프로필 머리글 "Remixed by N"·"Derived by N" 에 쓰는 묶음. creators 는 가장 최근 순 앞 몇 명(사진 겹침용). */
export const CreatorReachSchema = z.object({
  count: CountSchema,
  creators: z.array(CreatorSummarySchema).max(LIMITS.PROFILE_REACH_AVATARS),
});
export type CreatorReach = z.infer<typeof CreatorReachSchema>;

export const CreatorProfileResponseSchema = z.object({
  creator: CreatorSummarySchema,
  works: z.array(ProjectSummarySchema),
  identity: IdentitySnapshotSchema.nullable(),
  // 이 창작자를 리믹스 상대로 고른 다른 창작자 수(삭제·숨김 프로젝트 제외)
  remixedBy: CreatorReachSchema,
  // 이 창작자의 프로젝트에서 파생해 간 다른 창작자 수(삭제·숨김 프로젝트 제외)
  derivedBy: CreatorReachSchema,
});
export type CreatorProfileResponse = z.infer<typeof CreatorProfileResponseSchema>;
