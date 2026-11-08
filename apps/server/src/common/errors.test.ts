import { ApiErrorSchema, ErrorCodeSchema } from '@tome/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from './app-error';
import { ERROR_TABLE } from './error-table';
import { toErrorResult } from './all-exceptions.filter';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ERROR_TABLE', () => {
  it('covers all 34 error codes', () => {
    expect(ErrorCodeSchema.options).toHaveLength(34);
    expect(Object.keys(ERROR_TABLE).sort()).toEqual([...ErrorCodeSchema.options].sort());
  });

  it.each(ErrorCodeSchema.options)('%s maps to a valid HTTP error status', (code) => {
    const { status, message } = ERROR_TABLE[code];
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(600);
    expect(message.length).toBeGreaterThan(0);
  });

  it.each([
    ['ACCESS_CODE_INVALID', 401, false],
    ['UNAUTHENTICATED', 401, false],
    ['CONSENT_REQUIRED', 403, false],
    ['NOT_FOUND', 404, false],
    ['SET_LIMIT_REACHED', 409, false],
    ['GENERATION_IN_PROGRESS', 409, true],
    ['VALIDATION_FAILED', 400, false],
    ['ATTACHMENT_TOO_LARGE', 413, false],
    ['ATTACHMENT_TYPE_UNSUPPORTED', 415, false],
    ['SAFETY_BLOCKED', 422, false],
    ['AI_OUTPUT_INVALID', 502, true],
    ['AI_UNAVAILABLE', 503, true],
    ['AI_TIMEOUT', 504, true],
    ['DAILY_LIMIT_REACHED', 429, false],
    ['RATE_LIMITED', 429, true],
    ['NO_CHANGES', 422, false],
    ['INTERNAL', 500, true],
  ] as const)('%s is %i, retryable=%s', (code, status, retryable) => {
    expect(ERROR_TABLE[code]).toMatchObject({ status, retryable });
  });
});

describe('toErrorResult', () => {
  it('turns an AppError into the shared error body and its HTTP status', () => {
    const { status, body } = toErrorResult(new AppError('SET_LIMIT_REACHED'));
    expect(status).toBe(409);
    expect(ApiErrorSchema.parse(body).error).toMatchObject({
      code: 'SET_LIMIT_REACHED',
      retryable: false,
    });
    expect(body.error.details).toBeUndefined();
  });

  it('keeps details and a custom message', () => {
    const { body } = toErrorResult(new AppError('STEP_IN_PROGRESS', 'wait', { retryAfterMs: 500 }));
    expect(body.error).toMatchObject({
      message: 'wait',
      retryable: true,
      details: { retryAfterMs: 500 },
    });
  });

  it('turns an unknown exception into INTERNAL 500 without leaking its message', () => {
    const { status, body } = toErrorResult(new Error('password=hunter2'));
    expect(status).toBe(500);
    expect(ApiErrorSchema.parse(body).error.code).toBe('INTERNAL');
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });

  it('turns a non-Error throw into INTERNAL 500', () => {
    expect(toErrorResult('boom').status).toBe(500);
    expect(toErrorResult(null).body.error.code).toBe('INTERNAL');
  });

  it('maps framework 404 and 413 errors to their codes', () => {
    expect(toErrorResult({ status: 404 }).body.error.code).toBe('NOT_FOUND');
    expect(toErrorResult({ status: 413 }).body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ prompt: z.string().max(5) }));

  it('returns parsed data', () => {
    expect(pipe.transform({ prompt: 'ok' })).toEqual({ prompt: 'ok' });
  });

  it('throws VALIDATION_FAILED with details.fields', () => {
    try {
      pipe.transform({ prompt: 'too long' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code).toBe('VALIDATION_FAILED');
      expect(appError.details).toEqual({
        fields: [{ path: 'prompt', message: expect.any(String) }],
      });
    }
  });
});
