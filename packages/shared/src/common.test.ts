import { describe, expect, it } from 'vitest';
import {
  ApiErrorSchema,
  ErrorCodeSchema,
  IdSchema,
  IdempotencyKeySchema,
  IsoDateTimeSchema,
  LIMITS,
} from './common.js';

describe('common', () => {
  it('accepts uuid ids and rejects other strings', () => {
    expect(IdSchema.safeParse('3f2b8a1e-5c4d-4e6f-8a7b-9c0d1e2f3a4b').success).toBe(true);
    expect(IdSchema.safeParse('not-a-uuid').success).toBe(false);
  });

  it('accepts UTC datetimes only', () => {
    expect(IsoDateTimeSchema.safeParse('2026-11-08T09:30:00.000Z').success).toBe(true);
    expect(IsoDateTimeSchema.safeParse('2026-11-08T09:30:00+09:00').success).toBe(false);
  });

  it('requires a v4 uuid for idempotency keys', () => {
    expect(IdempotencyKeySchema.safeParse('3f2b8a1e-5c4d-4e6f-8a7b-9c0d1e2f3a4b').success).toBe(
      true,
    );
    expect(IdempotencyKeySchema.safeParse('3f2b8a1e-5c4d-1e6f-8a7b-9c0d1e2f3a4b').success).toBe(
      false,
    );
  });

  it('exposes the documented limits', () => {
    expect(LIMITS.PAGES_MAX).toBe(10);
    expect(LIMITS.SETS_PER_PAGE).toBe(3);
    expect(LIMITS.PROMPT_MAX).toBe(500);
  });

  it('lists every error code once', () => {
    const codes = ErrorCodeSchema.options;
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('STEP_IN_PROGRESS');
    expect(codes).toContain('INTERNAL');
  });

  it('parses an api error body and rejects unknown codes', () => {
    const ok = ApiErrorSchema.safeParse({
      error: {
        code: 'STEP_IN_PROGRESS',
        message: 'busy',
        retryable: true,
        details: { retryAfterMs: 500 },
      },
    });
    expect(ok.success).toBe(true);
    const bad = ApiErrorSchema.safeParse({
      error: { code: 'NOPE', message: 'x', retryable: false },
    });
    expect(bad.success).toBe(false);
  });
});
