import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from './health.js';

describe('HealthResponseSchema', () => {
  it('정상 응답을 통과시킨다', () => {
    const parsed = HealthResponseSchema.parse({
      status: 'ok',
      db: 'up',
      time: new Date().toISOString(),
    });
    expect(parsed.db).toBe('up');
  });

  it('알 수 없는 db 상태는 거절한다', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'ok',
      db: 'maybe',
      time: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
