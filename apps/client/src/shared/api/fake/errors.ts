import { ApiErrorSchema, type ApiError, type ErrorCode } from '@tome/shared';

/** 오류 코드별 HTTP 상태와 다시 시도 가능 여부. 가짜 서버가 실제 서버처럼 응답하는 데 쓴다. */
export const ERROR_HTTP: Record<ErrorCode, { status: number; retryable: boolean }> = {
  ACCESS_CODE_INVALID: { status: 401, retryable: false },
  UNAUTHENTICATED: { status: 401, retryable: false },
  CONSENT_REQUIRED: { status: 403, retryable: false },
  FORBIDDEN: { status: 403, retryable: false },
  IDENTITY_PRIVATE: { status: 403, retryable: false },
  NOT_FOUND: { status: 404, retryable: false },
  SET_LIMIT_REACHED: { status: 409, retryable: false },
  GENERATION_IN_PROGRESS: { status: 409, retryable: true },
  VALIDATION_FAILED: { status: 400, retryable: false },
  NOT_FINISHABLE: { status: 409, retryable: false },
  NOT_FINISHED: { status: 409, retryable: false },
  ATTACHMENT_TOO_LARGE: { status: 413, retryable: false },
  ATTACHMENT_TYPE_UNSUPPORTED: { status: 415, retryable: false },
  DERIVE_SOURCE_UNAVAILABLE: { status: 409, retryable: false },
  SAFETY_BLOCKED: { status: 422, retryable: false },
  AI_OUTPUT_INVALID: { status: 502, retryable: true },
  AI_UNAVAILABLE: { status: 503, retryable: true },
  AI_TIMEOUT: { status: 504, retryable: true },
  DAILY_LIMIT_REACHED: { status: 429, retryable: false },
  BUDGET_REACHED: { status: 429, retryable: false },
  RATE_LIMITED: { status: 429, retryable: true },
  IDEMPOTENCY_KEY_MISSING: { status: 400, retryable: false },
  IDEMPOTENCY_KEY_REUSED: { status: 409, retryable: false },
  NOTICE_OUTDATED: { status: 409, retryable: false },
  NOT_DRAFT: { status: 409, retryable: false },
  PAGE_LIMIT_REACHED: { status: 409, retryable: false },
  STEP_IN_PROGRESS: { status: 409, retryable: true },
  STAGE_OUT_OF_ORDER: { status: 409, retryable: true },
  JOB_CLOSED: { status: 409, retryable: false },
  NO_CHANGES: { status: 422, retryable: false },
  NO_PARTNER: { status: 409, retryable: false },
  ADMIN_TOKEN_INVALID: { status: 401, retryable: false },
  PAYLOAD_TOO_LARGE: { status: 413, retryable: false },
  INTERNAL: { status: 500, retryable: true },
};

/** 라우트 핸들러가 던지면 가짜 서버가 이 코드의 오류 응답으로 바꾼다. */
export class FakeFailure extends Error {
  readonly code: ErrorCode;
  /** 서버처럼 오류에 같이 실어 보내는 값(예: STAGE_OUT_OF_ORDER 의 expected) */
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, details?: Record<string, unknown>) {
    super(code);
    this.name = 'FakeFailure';
    this.code = code;
    this.details = details;
  }
}

/** 서버처럼 STEP_IN_PROGRESS 에는 다시 보낼 때까지 기다릴 시간을 같이 준다(캔버스의 재시도 확인용). */
export const FAKE_RETRY_AFTER_MS = 1000;

/** 입력 안전 검사(서버 #95)에 걸렸을 때 같이 오는 분류. 실제 값은 검사 모델이 정한다. */
export const FAKE_SAFETY_CATEGORIES: readonly string[] = ['S1'];

/** details 를 따로 주지 않았을 때 코드별로 서버와 같은 모양을 채운다. */
function defaultDetails(code: ErrorCode): Record<string, unknown> | undefined {
  if (code === 'STEP_IN_PROGRESS') return { retryAfterMs: FAKE_RETRY_AFTER_MS };
  if (code === 'SAFETY_BLOCKED') return { stage: 'input', categories: [...FAKE_SAFETY_CATEGORIES] };
  return undefined;
}

export function errorResponse(
  code: ErrorCode,
  details: Record<string, unknown> | undefined = defaultDetails(code),
): { status: number; body: ApiError } {
  const { status, retryable } = ERROR_HTTP[code];
  const body = ApiErrorSchema.parse({
    error: {
      code,
      message: `Simulated error: ${code}`,
      retryable,
      ...(details ? { details } : {}),
    },
  });
  return { status, body };
}
