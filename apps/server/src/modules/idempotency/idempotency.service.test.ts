import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../common';
import type { IdempotencyRepository, IdempotencyRow } from './idempotency.repository';
import {
  canonicalJson,
  hashRequest,
  IDEMPOTENCY_TTL_MS,
  IdempotencyService,
} from './idempotency.service';

const KEY = '7b1f1c1e-3a52-4d0e-9d57-5f0a8f6a9c11';
const SESSION = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

/** 메모리 안의 가짜 저장소. 트랜잭션은 실패하면 기록을 되돌린다. */
function fakeRepo() {
  const rows = new Map<string, IdempotencyRow>();
  const id = (s: string, k: string) => `${s}:${k}`;
  const repo = {
    transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapshot = new Map(rows);
      try {
        return await fn({});
      } catch (error) {
        rows.clear();
        snapshot.forEach((v, k) => rows.set(k, v));
        throw error;
      }
    },
    deleteExpired: async (_tx: unknown, s: string, k: string, olderThan: Date) => {
      const row = rows.get(id(s, k));
      if (row && row.createdAt < olderThan) rows.delete(id(s, k));
    },
    insertPlaceholder: async (
      _tx: unknown,
      r: { sessionId: string; key: string; route: string; requestHash: string },
    ) => {
      if (rows.has(id(r.sessionId, r.key))) {
        const { Prisma } = await import('../../generated/prisma/client');
        throw new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      rows.set(id(r.sessionId, r.key), {
        route: r.route,
        requestHash: r.requestHash,
        statusCode: 0,
        response: {},
        createdAt: new Date(),
      });
    },
    complete: async (_tx: unknown, s: string, k: string, statusCode: number, response: unknown) => {
      const row = rows.get(id(s, k))!;
      rows.set(id(s, k), { ...row, statusCode, response: response as IdempotencyRow['response'] });
    },
    find: async (s: string, k: string) => rows.get(id(s, k)) ?? null,
  };
  return { repo: repo as unknown as IdempotencyRepository, rows };
}

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let rows: Map<string, IdempotencyRow>;
  const request = (over: Partial<Parameters<IdempotencyService['run']>[0]> = {}) => ({
    sessionId: SESSION,
    key: KEY,
    route: 'POST /x',
    body: { a: 1 },
    ...over,
  });

  beforeEach(() => {
    const fake = fakeRepo();
    rows = fake.rows;
    service = new IdempotencyService(fake.repo);
  });

  afterEach(() => vi.useRealTimers());

  it('rejects a missing key with IDEMPOTENCY_KEY_MISSING', async () => {
    const work = vi.fn();
    await expect(service.run(request({ key: undefined }), work)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_MISSING',
    });
    await expect(service.run(request({ key: ' ' }), work)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_MISSING',
    });
    expect(work).not.toHaveBeenCalled();
  });

  it('rejects a key that is not a uuid v4 with VALIDATION_FAILED', async () => {
    const work = vi.fn();
    for (const key of ['nope', '0190a000-0000-7000-8000-000000000000']) {
      await expect(service.run(request({ key }), work)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    }
    expect(work).not.toHaveBeenCalled();
  });

  it('replays the stored response for the same key and body without running work again', async () => {
    const work = vi.fn(async () => ({ statusCode: 201, body: { n: Math.random() } }));
    const first = await service.run(request(), work);
    const second = await service.run(request({ body: { a: 1 } }), work);
    expect(work).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(second.statusCode).toBe(201);
  });

  it('treats a body with different key order as the same request', async () => {
    const work = vi.fn(async () => ({ statusCode: 201, body: { ok: true } }));
    await service.run(request({ body: { a: 1, b: { c: 2, d: 3 } } }), work);
    await service.run(request({ body: { b: { d: 3, c: 2 }, a: 1 } }), work);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('answers 409 IDEMPOTENCY_KEY_REUSED for a different body or route', async () => {
    const work = vi.fn(async () => ({ statusCode: 201, body: {} }));
    await service.run(request(), work);
    await expect(service.run(request({ body: { a: 2 } }), work)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
    await expect(service.run(request({ route: 'POST /y' }), work)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('keeps no record when work throws, so the same key can be retried', async () => {
    await expect(
      service.run(request(), async () => {
        throw new AppError('VALIDATION_FAILED');
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(rows.size).toBe(0);
    const result = await service.run(request(), async () => ({ statusCode: 201, body: { ok: 1 } }));
    expect(result.body).toEqual({ ok: 1 });
  });

  it('treats a record older than 24 hours as absent and processes again', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
    const work = vi.fn(async () => ({ statusCode: 201, body: { n: work.mock.calls.length } }));
    await service.run(request(), work);
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z').getTime() + IDEMPOTENCY_TTL_MS - 1000);
    await service.run(request(), work);
    expect(work).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z').getTime() + IDEMPOTENCY_TTL_MS + 1000);
    const again = await service.run(request({ body: { a: 2 } }), work);
    expect(work).toHaveBeenCalledTimes(2);
    expect(again.statusCode).toBe(201);
  });
});

describe('request hash', () => {
  it('sorts keys and ignores undefined values', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 1, c: undefined }] })).toBe('{"a":[{"d":1}],"b":1}');
  });

  it('differs by route and body', () => {
    expect(hashRequest('A', { x: 1 })).not.toBe(hashRequest('B', { x: 1 }));
    expect(hashRequest('A', { x: 1 })).not.toBe(hashRequest('A', { x: 2 }));
    expect(hashRequest('A', undefined)).toHaveLength(64);
  });
});
