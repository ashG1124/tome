import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, LIMITS } from './common.js';

export const CreatorKindSchema = z.enum(['seed', 'persona', 'visitor']);
export type CreatorKind = z.infer<typeof CreatorKindSchema>;

export const CreatorSummarySchema = z.object({
  id: IdSchema,
  kind: CreatorKindSchema,
  displayName: z.string().min(1).max(LIMITS.DISPLAY_NAME_MAX),
  bio: z.string().max(LIMITS.BIO_MAX).nullable(),
  avatarUrl: z.string().nullable(),
});
export type CreatorSummary = z.infer<typeof CreatorSummarySchema>;

export const CreateSessionRequestSchema = z.object({
  code: z.string().min(1),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const CreateSessionResponseSchema = z.object({
  token: z.string().min(1),
  creator: CreatorSummarySchema,
  consentRequired: z.boolean(),
  noticeVersion: z.string().min(1),
});
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

export const ConsentRequestSchema = z.object({
  noticeVersion: z.string().min(1),
});
export type ConsentRequest = z.infer<typeof ConsentRequestSchema>;

export const ConsentResponseSchema = z.object({
  agreedAt: IsoDateTimeSchema,
});
export type ConsentResponse = z.infer<typeof ConsentResponseSchema>;

export const MeResponseSchema = z.object({
  creator: CreatorSummarySchema,
  consented: z.boolean(),
  limits: z.record(z.string(), z.unknown()),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
