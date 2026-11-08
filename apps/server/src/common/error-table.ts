import type { ErrorCode } from '@tome/shared';

export interface ErrorSpec {
  status: number;
  retryable: boolean;
  message: string;
}

/** 오류 코드마다 HTTP 상태·재시도 가능 여부·기본 메시지. 코드가 하나라도 빠지면 타입 오류가 난다. */
export const ERROR_TABLE: Record<ErrorCode, ErrorSpec> = {
  ACCESS_CODE_INVALID: { status: 401, retryable: false, message: 'The access code is not valid.' },
  UNAUTHENTICATED: { status: 401, retryable: false, message: 'Authentication is required.' },
  CONSENT_REQUIRED: { status: 403, retryable: false, message: 'Consent is required.' },
  FORBIDDEN: { status: 403, retryable: false, message: 'You cannot change this resource.' },
  IDENTITY_PRIVATE: { status: 403, retryable: false, message: 'This identity is private.' },
  NOT_FOUND: { status: 404, retryable: false, message: 'The resource was not found.' },
  SET_LIMIT_REACHED: {
    status: 409,
    retryable: false,
    message: 'This page has reached its set limit.',
  },
  GENERATION_IN_PROGRESS: {
    status: 409,
    retryable: true,
    message: 'A generation is already in progress.',
  },
  VALIDATION_FAILED: { status: 400, retryable: false, message: 'The request is not valid.' },
  NOT_FINISHABLE: {
    status: 409,
    retryable: false,
    message: 'The project cannot be finished yet.',
  },
  NOT_FINISHED: { status: 409, retryable: false, message: 'The project is not finished.' },
  ATTACHMENT_TOO_LARGE: { status: 413, retryable: false, message: 'The attachment is too large.' },
  ATTACHMENT_TYPE_UNSUPPORTED: {
    status: 415,
    retryable: false,
    message: 'The attachment type is not supported.',
  },
  DERIVE_SOURCE_UNAVAILABLE: {
    status: 409,
    retryable: false,
    message: 'The source project is not available.',
  },
  SAFETY_BLOCKED: {
    status: 422,
    retryable: false,
    message: 'The request was blocked by the safety filter.',
  },
  AI_OUTPUT_INVALID: { status: 502, retryable: true, message: 'The AI output was not valid.' },
  AI_UNAVAILABLE: { status: 503, retryable: true, message: 'The AI service is unavailable.' },
  AI_TIMEOUT: { status: 504, retryable: true, message: 'The AI service timed out.' },
  DAILY_LIMIT_REACHED: {
    status: 429,
    retryable: false,
    message: 'The daily generation limit is reached.',
  },
  BUDGET_REACHED: { status: 429, retryable: false, message: 'The monthly budget is reached.' },
  RATE_LIMITED: { status: 429, retryable: true, message: 'Too many requests. Try again shortly.' },
  IDEMPOTENCY_KEY_MISSING: {
    status: 400,
    retryable: false,
    message: 'The Idempotency-Key header is required.',
  },
  IDEMPOTENCY_KEY_REUSED: {
    status: 409,
    retryable: false,
    message: 'The Idempotency-Key was used with a different request.',
  },
  NOTICE_OUTDATED: { status: 409, retryable: false, message: 'The notice version is outdated.' },
  NOT_DRAFT: { status: 409, retryable: false, message: 'The answer is not a draft.' },
  PAGE_LIMIT_REACHED: {
    status: 409,
    retryable: false,
    message: 'The project has reached its page limit.',
  },
  STEP_IN_PROGRESS: { status: 409, retryable: true, message: 'This step is already running.' },
  STAGE_OUT_OF_ORDER: {
    status: 409,
    retryable: true,
    message: 'The stage was requested out of order.',
  },
  JOB_CLOSED: { status: 409, retryable: false, message: 'The job is already closed.' },
  NO_CHANGES: { status: 422, retryable: false, message: 'There are no changes to apply.' },
  NO_PARTNER: { status: 409, retryable: false, message: 'No remix partner is selected.' },
  ADMIN_TOKEN_INVALID: { status: 401, retryable: false, message: 'The admin token is not valid.' },
  PAYLOAD_TOO_LARGE: { status: 413, retryable: false, message: 'The request body is too large.' },
  INTERNAL: { status: 500, retryable: true, message: 'Something went wrong.' },
};
