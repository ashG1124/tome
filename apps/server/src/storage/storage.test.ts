import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalObjectStorage } from './local-object-storage';
import { R2ObjectStorage } from './r2-object-storage';

describe('LocalObjectStorage', () => {
  let dir: string;
  let clock = 1_000_000;
  let storage: LocalObjectStorage;
  const bytes = new Uint8Array([1, 2, 3, 4]);

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tome-storage-'));
    storage = new LocalObjectStorage({ dir, secret: 'test-secret', now: () => clock });
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const token = (url: string) => url.replace('/assets/local/', '');

  it('stores bytes and reads them back through a signed relative URL', async () => {
    await storage.put('answers/a/full.png', bytes, 'image/png');
    const url = await storage.signedGetUrl('answers/a/full.png', { ttlSeconds: 300 });
    expect(url.startsWith('/assets/local/')).toBe(true);
    const asset = await storage.readSigned(token(url));
    expect(Array.from(asset.bytes)).toEqual([1, 2, 3, 4]);
    expect(asset.contentType).toBe('image/png');
    expect(asset.downloadName).toBeUndefined();
  });

  it('carries a sanitized download name', async () => {
    const url = await storage.signedGetUrl('answers/a/full.png', {
      ttlSeconds: 300,
      downloadName: 'tome answer"1.png',
    });
    expect((await storage.readSigned(token(url))).downloadName).toBe('tome_answer_1.png');
  });

  it('rejects a forged signature, a tampered payload and garbage', async () => {
    const url = await storage.signedGetUrl('answers/a/full.png', { ttlSeconds: 300 });
    const [body, signature] = token(url).split('.');
    const other = Buffer.from(
      JSON.stringify({ k: 'answers/b/full.png', e: clock + 999_999 }),
    ).toString('base64url');
    await expect(storage.readSigned(`${other}.${signature}`)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(storage.readSigned(`${body}.AAAA`)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(storage.readSigned('nonsense')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const foreign = new LocalObjectStorage({ dir, secret: 'other-secret', now: () => clock });
    await expect(foreign.readSigned(token(url))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects an expired token', async () => {
    const url = await storage.signedGetUrl('answers/a/full.png', { ttlSeconds: 30 });
    clock += 30_000;
    await expect(storage.readSigned(token(url))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses keys that escape the storage directory', async () => {
    for (const key of ['../evil.png', 'a/../../evil.png', '/etc/passwd', 'a//b', 'a\\b', '']) {
      await expect(storage.put(key, bytes, 'image/png')).rejects.toThrow();
      await expect(storage.signedGetUrl(key, { ttlSeconds: 30 })).rejects.toThrow();
    }
  });

  it('refuses a validly signed token whose key escapes the directory', async () => {
    // 서명 키를 아는 쪽이 만든 토큰이라도 경로 탈출은 거부한다.
    const { createHmac } = await import('node:crypto');
    const body = Buffer.from(JSON.stringify({ k: '../x.png', e: clock + 60_000 })).toString(
      'base64url',
    );
    const signature = createHmac('sha256', Buffer.from('test-secret'))
      .update(body)
      .digest('base64url');
    await expect(storage.readSigned(`${body}.${signature}`)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('deletes objects', async () => {
    await storage.put('answers/d/full.png', bytes, 'image/png');
    await storage.delete('answers/d/full.png');
    await expect(readFile(join(dir, 'answers/d/full.png'))).rejects.toThrow();
  });
});

describe('R2ObjectStorage', () => {
  const storage = new R2ObjectStorage({
    endpoint: 'https://acct.r2.cloudflarestorage.com',
    bucket: 'tome-bucket',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'super-secret-key-value',
  });

  it('signs a GET URL in the query string without leaking the secret key', async () => {
    const url = await storage.signedGetUrl('answers/a/full.png', { ttlSeconds: 300 });
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://acct.r2.cloudflarestorage.com');
    expect(parsed.pathname).toBe('/tome-bucket/answers/a/full.png');
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(parsed.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(url).not.toContain('super-secret-key-value');
  });

  it('adds a content-disposition override for downloads', async () => {
    const url = await storage.signedGetUrl('answers/a/full.png', {
      ttlSeconds: 300,
      downloadName: 'tome-answer-1.png',
    });
    expect(new URL(url).searchParams.get('response-content-disposition')).toBe(
      'attachment; filename="tome-answer-1.png"',
    );
  });
});
