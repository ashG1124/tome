import type { ApiError, ErrorCode } from '@tome/shared';

/** 서버가 오류 본문을 돌려준 경우 */
export class ApiRequestError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, body: ApiError['error']) {
    super(body.message);
    this.name = 'ApiRequestError';
    this.code = body.code;
    this.status = status;
    this.retryable = body.retryable;
    this.details = body.details;
  }
}

/** 서버에 닿지 못한 경우(연결 끊김 등) */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Network request failed', { cause });
    this.name = 'NetworkError';
  }
}
