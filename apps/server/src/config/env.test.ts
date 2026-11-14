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

describe('parseEnv storage settings', () => {
  const r2 = {
    STORAGE_DRIVER: 'r2',
    R2_ENDPOINT: 'https://example-account.r2.cloudflarestorage.com',
    R2_BUCKET: 'bucket',
    R2_ACCESS_KEY_ID: 'key-id',
    R2_SECRET_ACCESS_KEY: 'super-secret',
  };

  it('defaults to the local driver and a 300 second URL lifetime', () => {
    const env = parseEnv(base);
    expect(env.STORAGE_DRIVER).toBe('local');
    expect(env.ASSET_URL_TTL_SECONDS).toBe(300);
    expect(env.STORAGE_LOCAL_DIR).toBeUndefined();
    expect(env.STORAGE_LOCAL_SECRET).toBeUndefined();
  });

  it('accepts r2 when all four R2 values are present', () => {
    expect(parseEnv({ ...base, ...r2 }).STORAGE_DRIVER).toBe('r2');
  });

  it.each(['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'])(
    'rejects r2 without %s, naming only the field',
    (name) => {
      const rest: Record<string, string> = { ...base, ...r2 };
      delete rest[name];
      let message = '';
      try {
        parseEnv(rest);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain(name);
      expect(message).not.toContain('super-secret');
      expect(message).not.toContain('key-id');
    },
  );

  it('does not require R2 values for the local driver', () => {
    expect(() => parseEnv({ ...base, STORAGE_DRIVER: 'local' })).not.toThrow();
  });

  it('rejects an unknown driver and an out-of-range URL lifetime', () => {
    expect(() => parseEnv({ ...base, STORAGE_DRIVER: 's3' })).toThrow('STORAGE_DRIVER');
    expect(() => parseEnv({ ...base, ASSET_URL_TTL_SECONDS: '29' })).toThrow(
      'ASSET_URL_TTL_SECONDS',
    );
    expect(() => parseEnv({ ...base, ASSET_URL_TTL_SECONDS: '3601' })).toThrow(
      'ASSET_URL_TTL_SECONDS',
    );
    expect(parseEnv({ ...base, ASSET_URL_TTL_SECONDS: '60' }).ASSET_URL_TTL_SECONDS).toBe(60);
  });
});
