import { randomUUID } from 'node:crypto';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AdminAccessCodeResponseSchema,
  ApiErrorSchema,
  ConsentResponseSchema,
  CreateSessionResponseSchema,
  MeResponseSchema,
} from '@tome/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client';
import { LoginRateLimiter } from '../src/modules/session/login-rate-limiter';

// 실제 Postgres(마이그레이션·시드 적용 완료)가 있을 때만 돈다. TEST_DATABASE_URL 이 없으면 건너뛴다.
const url = process.env.TEST_DATABASE_URL;

const ADMIN_TOKEN = 'e2e-admin-token-for-tests';
const SEED_CREATOR_ID = '00000000-0000-7000-8000-000100000001';

// 동의가 필요한 보호 라우트의 대역. src 에는 두지 않고 이 테스트 모듈에만 등록한다.
@Controller('__test')
class TestProtectedController {
  @Get('protected')
  get() {
    return { ok: true };
  }
}

describe.skipIf(!url)('session, consent and admin API (real Postgres)', () => {
  let app: INestApplication;
  let base: string;
  let prisma: PrismaClient;
  let limiter: LoginRateLimiter;
  const runId = randomUUID();
  const prefix = `e2e-session-${runId}`;
  const poolCode = `pool-${runId}`;
  const creatorCode = `creator-${runId}`;

  const putCode = (label: string, body: unknown, token: string | null = ADMIN_TOKEN) =>
    fetch(`${base}/admin/access-codes/${encodeURIComponent(label)}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...(token === null ? {} : { 'x-admin-token': token }),
      },
      body: JSON.stringify(body),
    });
  const login = (code: string) =>
    fetch(`${base}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  const call = (method: string, path: string, token?: string, body?: unknown) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const newSession = async (code = poolCode) => {
    const res = await login(code);
    expect(res.status).toBe(200);
    return CreateSessionResponseSchema.parse(await res.json());
  };
  const errorCode = async (res: Response) => ApiErrorSchema.parse(await res.json()).error.code;

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', url!);
    vi.stubEnv('AI_PROVIDER', 'mock');
    vi.stubEnv('ADMIN_TOKEN', ADMIN_TOKEN);
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestProtectedController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    base = await app.getUrl();
    limiter = app.get(LoginRateLimiter, { strict: false });
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  });

  beforeEach(() => limiter.clear());

  // 이 테스트가 만든 행만 지운다(시드 Creator·visitorCursor 는 그대로 둔다).
  afterAll(async () => {
    if (prisma) {
      const codes = await prisma.accessCode.findMany({
        where: { label: { startsWith: prefix } },
        select: { id: true },
      });
      const ids = codes.map((code) => code.id);
      await prisma.demoSession.deleteMany({ where: { accessCodeId: { in: ids } } });
      await prisma.accessCode.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();
    }
    await app?.close();
    vi.unstubAllEnvs();
  });

  describe('admin API', () => {
    const body = { code: poolCode, target: 'visitor_pool', active: true };

    it('rejects a missing or wrong X-Admin-Token with ADMIN_TOKEN_INVALID', async () => {
      for (const token of [null, 'wrong', `${ADMIN_TOKEN}x`]) {
        const res = await putCode(`${prefix} a`, body, token);
        expect(res.status).toBe(401);
        expect(await errorCode(res)).toBe('ADMIN_TOKEN_INVALID');
      }
    });

    it('registers a code without echoing the code or its hash, and updates by label', async () => {
      const res = await putCode(`${prefix} pool`, body);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain(poolCode);
      expect(text).not.toMatch(/hash|scrypt/i);
      const first = AdminAccessCodeResponseSchema.parse(JSON.parse(text)).accessCode;
      expect(first).toMatchObject({
        label: `${prefix} pool`,
        target: 'visitor_pool',
        creatorId: null,
        active: true,
      });

      const again = await putCode(`${prefix} pool`, { ...body, active: false });
      const second = AdminAccessCodeResponseSchema.parse(await again.json()).accessCode;
      expect(second.id).toBe(first.id);
      expect(second.active).toBe(false);
      expect(await prisma.accessCode.count({ where: { label: `${prefix} pool` } })).toBe(1);

      // 비활성이면 로그인 안 됨 → 다시 켠다.
      expect((await login(poolCode)).status).toBe(401);
      await putCode(`${prefix} pool`, body);
    });

    it('validates target/creatorId pairing and creator existence', async () => {
      const bad = [
        { code: 'x', target: 'creator', active: true },
        { code: 'x', target: 'visitor_pool', creatorId: SEED_CREATOR_ID, active: true },
        { code: 'x', target: 'creator', creatorId: randomUUID(), active: true },
        { code: '', target: 'visitor_pool', active: true },
      ];
      for (const payload of bad) {
        const res = await putCode(`${prefix} bad`, payload);
        expect(res.status).toBe(400);
        expect(await errorCode(res)).toBe('VALIDATION_FAILED');
      }
      expect(await prisma.accessCode.count({ where: { label: `${prefix} bad` } })).toBe(0);
    });

    it('registers a creator code', async () => {
      const res = await putCode(`${prefix} creator`, {
        code: creatorCode,
        target: 'creator',
        creatorId: SEED_CREATOR_ID,
        active: true,
      });
      expect(res.status).toBe(200);
      expect(AdminAccessCodeResponseSchema.parse(await res.json()).accessCode.creatorId).toBe(
        SEED_CREATOR_ID,
      );
    });
  });

  describe('POST /session', () => {
    it('401 ACCESS_CODE_INVALID for a wrong code', async () => {
      const res = await login('definitely-wrong');
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe('ACCESS_CODE_INVALID');
    });

    it('400 VALIDATION_FAILED for an empty body', async () => {
      const res = await call('POST', '/session', undefined, {});
      expect(res.status).toBe(400);
    });

    it('429 RATE_LIMITED with Retry-After after 5 wrong codes from one IP', async () => {
      for (let i = 0; i < 5; i++) expect((await login('wrong')).status).toBe(401);
      const res = await login('wrong');
      expect(res.status).toBe(429);
      const retryAfter = Number(res.headers.get('retry-after'));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(600);
      const error = ApiErrorSchema.parse(await res.json()).error;
      expect(error).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
      expect(error.details?.retryAfterSec).toBe(retryAfter);
      // 막힌 동안에는 맞는 코드도 막힌다.
      expect((await login(poolCode)).status).toBe(429);
    });

    it('a success resets the failure counter', async () => {
      for (let i = 0; i < 4; i++) await login('wrong');
      await newSession();
      for (let i = 0; i < 4; i++) expect((await login('wrong')).status).toBe(401);
    });

    it('200 with a valid body, consentRequired=true and only the token hash stored', async () => {
      const session = await newSession();
      expect(session.consentRequired).toBe(true);
      expect(session.noticeVersion).toBeTruthy();
      expect(session.creator.avatarUrl).toBeNull();
      const stored = await prisma.demoSession.findMany({
        where: { accessCode: { label: { startsWith: prefix } } },
        select: { tokenHash: true, ipHash: true },
      });
      expect(stored.length).toBeGreaterThan(0);
      expect(stored.some((row) => row.tokenHash === session.token)).toBe(false);
      expect(stored.every((row) => row.ipHash === null)).toBe(true);
    });

    it('a creator code logs in as that creator', async () => {
      const session = await newSession(creatorCode);
      expect(session.creator.id).toBe(SEED_CREATOR_ID);
      expect(session.creator.kind).toBe('seed');
    });

    it('visitor_pool codes hand out visitor accounts in turn, never the same twice in a row', async () => {
      const a = await newSession();
      const b = await newSession();
      const c = await newSession();
      for (const s of [a, b, c]) expect(s.creator.kind).toBe('visitor');
      expect(a.creator.id).not.toBe(b.creator.id);
      expect(b.creator.id).not.toBe(c.creator.id);
    });

    it('concurrent logins get distinct accounts (atomic cursor)', async () => {
      const visitors = await prisma.creator.count({ where: { kind: 'visitor' } });
      const n = Math.min(visitors, 5);
      const sessions = await Promise.all(Array.from({ length: n }, () => newSession()));
      expect(new Set(sessions.map((s) => s.creator.id)).size).toBe(n);
    });
  });

  describe('auth, consent and /me', () => {
    it('401 UNAUTHENTICATED without or with a bogus Authorization header', async () => {
      for (const token of [undefined, 'not-a-real-token']) {
        for (const [method, path] of [
          ['GET', '/me'],
          ['POST', '/session/consent'],
          ['DELETE', '/session'],
          ['GET', '/__test/protected'],
        ] as const) {
          const res = await call(method, path, token, method === 'POST' ? {} : undefined);
          expect(res.status).toBe(401);
          expect(await errorCode(res)).toBe('UNAUTHENTICATED');
        }
      }
      const malformed = await fetch(`${base}/me`, { headers: { authorization: 'Token abc' } });
      expect(malformed.status).toBe(401);
    });

    it('401 for an expired token', async () => {
      const session = await newSession();
      expect((await call('GET', '/me', session.token)).status).toBe(200);
      await prisma.demoSession.updateMany({
        where: { accessCode: { label: { startsWith: prefix } } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect((await call('GET', '/me', session.token)).status).toBe(401);
    });

    it('before consent: /me is 200 with consented=false, protected routes are 403', async () => {
      const session = await newSession();
      const me = await call('GET', '/me', session.token);
      expect(me.status).toBe(200);
      const body = MeResponseSchema.parse(await me.json());
      expect(body.consented).toBe(false);
      expect(body.limits).toEqual({});
      expect(body.creator.id).toBe(session.creator.id);

      const blocked = await call('GET', '/__test/protected', session.token);
      expect(blocked.status).toBe(403);
      expect(await errorCode(blocked)).toBe('CONSENT_REQUIRED');
    });

    it('consent is idempotent, rejects other versions and unlocks protected routes', async () => {
      const session = await newSession();
      const consent = (version: string) =>
        call('POST', '/session/consent', session.token, { noticeVersion: version });

      const first = await consent(session.noticeVersion);
      const second = await consent(session.noticeVersion);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const a = ConsentResponseSchema.parse(await first.json());
      const b = ConsentResponseSchema.parse(await second.json());
      expect(a.agreedAt).toBe(b.agreedAt);

      const outdated = await consent(`${session.noticeVersion}-old`);
      expect(outdated.status).toBe(409);
      expect(await errorCode(outdated)).toBe('NOTICE_OUTDATED');

      expect((await call('POST', '/session/consent', session.token, {})).status).toBe(400);

      const me = MeResponseSchema.parse(await (await call('GET', '/me', session.token)).json());
      expect(me.consented).toBe(true);
      const ok = await call('GET', '/__test/protected', session.token);
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ ok: true });
    });

    it('simultaneous consents all succeed with the same agreedAt', async () => {
      const session = await newSession();
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          call('POST', '/session/consent', session.token, { noticeVersion: session.noticeVersion }),
        ),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      const times = await Promise.all(
        results.map(async (r) => ConsentResponseSchema.parse(await r.json()).agreedAt),
      );
      expect(new Set(times).size).toBe(1);
    });

    it('DELETE /session is 204 and the token stops working', async () => {
      const session = await newSession();
      const del = await call('DELETE', '/session', session.token);
      expect(del.status).toBe(204);
      const after = await call('GET', '/me', session.token);
      expect(after.status).toBe(401);
      expect(await errorCode(after)).toBe('UNAUTHENTICATED');
    });

    it('/health stays public', async () => {
      expect((await fetch(`${base}/health`)).status).toBe(200);
    });
  });
});
