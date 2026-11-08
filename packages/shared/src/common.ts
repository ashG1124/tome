import { z } from 'zod';

export const LIMITS = {
  PROMPT_MAX: 500,
  TITLE_MAX: 60,
  REASON_MAX: 300,
  COMMENT_MAX: 300,
  DISPLAY_NAME_MAX: 40,
  BIO_MAX: 120,
  TOPIC_TITLE_MAX: 80,
  SETS_PER_PAGE: 3,
  PAGES_MAX: 10,
  PREVIEW_IDLE_MS: 3000,
  WEIGHT_MIN: 0,
  WEIGHT_MAX: 9,
  PAD_MIN: -5,
  PAD_MAX: 5,
  AXIS_SCORE_MIN: -100,
  AXIS_SCORE_MAX: 100,
  EVENT_BATCH_MAX: 50,
} as const;

export const IdSchema = z.uuid();
export type Id = z.infer<typeof IdSchema>;

export const IsoDateTimeSchema = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

export const IdempotencyKeySchema = z.uuid({ version: 'v4' });
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;

export const ErrorCodeSchema = z.enum([
  'ACCESS_CODE_INVALID',
  'UNAUTHENTICATED',
  'CONSENT_REQUIRED',
  'FORBIDDEN',
  'IDENTITY_PRIVATE',
  'NOT_FOUND',
  'SET_LIMIT_REACHED',
  'GENERATION_IN_PROGRESS',
  'VALIDATION_FAILED',
  'NOT_FINISHABLE',
  'NOT_FINISHED',
  'ATTACHMENT_TOO_LARGE',
  'ATTACHMENT_TYPE_UNSUPPORTED',
  'DERIVE_SOURCE_UNAVAILABLE',
  'SAFETY_BLOCKED',
  'AI_OUTPUT_INVALID',
  'AI_UNAVAILABLE',
  'AI_TIMEOUT',
  'DAILY_LIMIT_REACHED',
  'BUDGET_REACHED',
  'RATE_LIMITED',
  'IDEMPOTENCY_KEY_MISSING',
  'IDEMPOTENCY_KEY_REUSED',
  'NOTICE_OUTDATED',
  'NOT_DRAFT',
  'PAGE_LIMIT_REACHED',
  'STEP_IN_PROGRESS',
  'STAGE_OUT_OF_ORDER',
  'JOB_CLOSED',
  'NO_CHANGES',
  'NO_PARTNER',
  'ADMIN_TOKEN_INVALID',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
