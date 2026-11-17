import type { ErrorCode } from '@tome/shared';
import { ERROR_TABLE } from './error-table';

/** 서버가 던지는 유일한 업무 오류. 응답 모양과 HTTP 상태는 예외 필터가 오류 표로 정한다. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message ?? ERROR_TABLE[code].message);
    this.name = 'AppError';
  }
}
