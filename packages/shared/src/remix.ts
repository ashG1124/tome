import { z } from 'zod';
import { IdSchema } from './common.js';
import { NodeIdSchema } from './node.js';
import { CreatorSummarySchema } from './session.js';

export const RemixCandidateSchema = z.object({
  id: IdSchema,
  displayName: CreatorSummarySchema.shape.displayName,
  bio: CreatorSummarySchema.shape.bio,
  avatarUrl: CreatorSummarySchema.shape.avatarUrl,
  favorite: z.boolean(),
  provisional: z.boolean(),
});
export type RemixCandidate = z.infer<typeof RemixCandidateSchema>;

export const RemixCandidatesResponseSchema = z.object({
  creators: z.array(RemixCandidateSchema),
});
export type RemixCandidatesResponse = z.infer<typeof RemixCandidatesResponseSchema>;

export const SetRemixPartnerRequestSchema = z.object({
  partnerId: IdSchema.nullable(),
});
export type SetRemixPartnerRequest = z.infer<typeof SetRemixPartnerRequestSchema>;

export const RemixStateSchema = z.object({
  partner: CreatorSummarySchema,
  snapshotId: IdSchema,
});
export type RemixState = z.infer<typeof RemixStateSchema>;

export const ConnectionStatusSchema = z.enum(['shown', 'applied', 'dismissed']);
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

export const ConnectionSchema = z.object({
  id: IdSchema,
  nodeId: NodeIdSchema,
  predictedAction: z.string().min(1),
  sentence: z.string().min(1),
  status: ConnectionStatusSchema,
});
export type Connection = z.infer<typeof ConnectionSchema>;

export const ConnectionListResponseSchema = z.object({
  connections: z.array(ConnectionSchema),
});
export type ConnectionListResponse = z.infer<typeof ConnectionListResponseSchema>;
