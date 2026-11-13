import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const base = { DATABASE_URL: 'postgresql://tome:tome@localhost:55433/tome' };

describe('parseEnv', () => {
  it('fills defaults', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.AI_PROVIDER).toBe('mock');
    expect(env.DIRECT_DATABASE_URL).toBeUndefined();
    expect(env.CORS_ORIGIN).toBe('http://localhost:5173');
    expect(env.ADMIN_TOKEN).toBeUndefined();
  });

  it('reads ADMIN_TOKEN and treats an empty one as unset', () => {
    expect(parseEnv({ ...base, ADMIN_TOKEN: 't' }).ADMIN_TOKEN).toBe('t');
    expect(parseEnv({ ...base, ADMIN_TOKEN: '' }).ADMIN_TOKEN).toBeUndefined();
  });

  it('coerces PORT to a number', () => {
    expect(parseEnv({ ...base, PORT: '4000' }).PORT).toBe(4000);
  });

  it('rejects a missing DATABASE_URL, naming only the field', () => {
    expect(() => parseEnv({})).toThrow('DATABASE_URL');
  });

  it('treats an empty value as unset', () => {
    const env = parseEnv({ ...base, DIRECT_DATABASE_URL: '', PORT: '' });
    expect(env.DIRECT_DATABASE_URL).toBeUndefined();
    expect(env.PORT).toBe(3000);
  });

  it('rejects an AI_PROVIDER other than mock', () => {
    expect(() => parseEnv({ ...base, AI_PROVIDER: 'gemini' })).toThrow('AI_PROVIDER');
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => parseEnv({ ...base, PORT: '70000' })).toThrow('PORT');
  });

  it('does not echo secret values in the error message', () => {
    const secret = 'postgresql://user:hunter2@host/db';
    try {
      parseEnv({ DATABASE_URL: secret, PORT: 'abc' });
    } catch (error) {
      expect((error as Error).message).not.toContain('hunter2');
    }
  });
});
