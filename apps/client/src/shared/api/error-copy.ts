import type { ErrorCode } from '@tome/shared';
import type { CopyKey } from '../copy';
import { ApiRequestError, NetworkError } from './errors';

/**
 * 오류 코드가 이어지는 화면 문구. 첫 번째가 기본이고, 나머지는 화면 상황에 따라 함께 또는 대신 쓴다.
 * null 은 화면이 자동으로 처리하는 코드라서 사용자에게 보이는 문구가 없다.
 */
export const ERROR_COPY: Record<ErrorCode, readonly CopyKey[] | null> = {
  ACCESS_CODE_INVALID: ['C-05b'],
  UNAUTHENTICATED: ['C-04'],
  CONSENT_REQUIRED: ['C-01', 'C-02', 'C-03'],
  FORBIDDEN: ['E-01a'],
  IDENTITY_PRIVATE: ['S-04'],
  NOT_FOUND: ['E-01a', 'S-06'],
  SET_LIMIT_REACHED: ['S-09'],
  GENERATION_IN_PROGRESS: ['S-03'],
  VALIDATION_FAILED: ['E-04'],
  NOT_FINISHABLE: ['G1'],
  NOT_FINISHED: ['E-05'],
  ATTACHMENT_TOO_LARGE: ['E-06'],
  ATTACHMENT_TYPE_UNSUPPORTED: ['E-06'],
  DERIVE_SOURCE_UNAVAILABLE: ['S-06', 'E-01a'],
  SAFETY_BLOCKED: ['E-02'],
  AI_OUTPUT_INVALID: ['E-01a', 'E-01b'],
  AI_UNAVAILABLE: ['E-01a', 'E-01b'],
  AI_TIMEOUT: ['E-01a', 'E-01b'],
  DAILY_LIMIT_REACHED: ['C-08'],
  BUDGET_REACHED: ['C-08'],
  RATE_LIMITED: ['G2'],
  IDEMPOTENCY_KEY_MISSING: null,
  IDEMPOTENCY_KEY_REUSED: null,
  NOTICE_OUTDATED: null,
  NOT_DRAFT: null,
  PAGE_LIMIT_REACHED: null,
  STEP_IN_PROGRESS: null,
  STAGE_OUT_OF_ORDER: null,
  JOB_CLOSED: null,
  NO_CHANGES: null,
  NO_PARTNER: null,
  ADMIN_TOKEN_INVALID: null,
  PAYLOAD_TOO_LARGE: null,
  INTERNAL: ['E-01a'],
};

/** 사용자에게 보여 줄 오류 문구 키 하나. 연결 실패는 E-03, 문구가 없는 오류는 E-01a 로 대신한다. */
export function errorCopyKey(error: unknown): CopyKey {
  if (error instanceof NetworkError) return 'E-03';
  if (error instanceof ApiRequestError) return ERROR_COPY[error.code]?.[0] ?? 'E-01a';
  return 'E-01a';
}

/** 오류 때문에 다른 화면으로 보내야 하면 그 경로를 돌려준다. */
export function authRedirectTarget(error: unknown): '/enter' | '/consent' | null {
  if (!(error instanceof ApiRequestError)) return null;
  if (error.code === 'UNAUTHENTICATED') return '/enter';
  if (error.code === 'CONSENT_REQUIRED') return '/consent';
  return null;
}
