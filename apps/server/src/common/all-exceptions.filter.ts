import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import type { ApiError, ErrorCode } from '@tome/shared';
import type { Response } from 'express';
import { AppError } from './app-error';
import { ERROR_TABLE } from './error-table';

export interface ErrorResult {
  status: number;
  body: ApiError;
}

/** 프레임워크(라우트 없음·본문 크기·JSON 문법)가 만든 HTTP 오류를 오류 코드로 옮긴다. */
function codeFromHttpStatus(exception: unknown): ErrorCode | undefined {
  const status = (exception as { status?: unknown } | null)?.status;
  if (status === 404) return 'NOT_FOUND';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status === 400) return 'VALIDATION_FAILED';
  return undefined;
}

export function toErrorResult(exception: unknown): ErrorResult {
  if (exception instanceof AppError) {
    const spec = ERROR_TABLE[exception.code];
    const error: ApiError['error'] = {
      code: exception.code,
      message: exception.message,
      retryable: spec.retryable,
    };
    if (exception.details) error.details = exception.details;
    return { status: spec.status, body: { error } };
  }
  const code = codeFromHttpStatus(exception) ?? 'INTERNAL';
  const spec = ERROR_TABLE[code];
  return {
    status: spec.status,
    body: { error: { code, message: spec.message, retryable: spec.retryable } },
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = toErrorResult(exception);
    if (body.error.code === 'INTERNAL') {
      // 메시지에는 쿼리 값이 섞일 수 있어 이름만 남긴다.
      const name = exception instanceof Error ? exception.name : typeof exception;
      this.logger.error(`Unhandled exception: ${name}`);
    }
    host.switchToHttp().getResponse<Response>().status(status).json(body);
  }
}
