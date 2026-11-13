import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ApiErrorSchema,
  CreateProjectResponseSchema,
  CreateSessionResponseSchema,
  LIMITS,
  PROMPT_PRESETS,
  ProjectListResponseSchema,
  UpdateProjectResponseSchema,
} from '@tome/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client';
import { LoginRateLimiter } from '../src/modules/session/login-rate-limiter';
import { PrismaService } from '../src/prisma/prisma.service';
import { SEED_CREATORS } from '../prisma/seed/creators';

// 실제 Postgres(마이그레이션 적용 완료)가 있을 때만 돈다. TEST_DATABASE_URL 이 없으면 건너뛴다.
const url = process.env.TEST_DATABASE_URL;

const ADMIN_TOKEN = 'e2e-admin-token-for-tests';

interface Owner {
  creatorId: string;
  token: string;
  sessionId: string;
}

describe.skipIf(!url)('projects API (real Postgres)', () => {
  let app: INestApplication;
  let base: string;
  let prisma: PrismaClient;
  const runId = randomUUID();
  const prefix = `e2e-projects-${runId}`;
  const creatorIds: string[] = [];

  const call = (method: string, path: string, token?: string, body?: unknown, key?: string) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(key ? { 'idempotency-key': key } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const errorCode = async (res: Response) => ApiErrorSchema.parse(await res.json()).error.code;

  /** 전용 Creator + creator 코드로 로그인한 세션. consent=false 면 동의하지 않는다. */
  const newOwner = async (consent = true): Promise<Owner> => {
    const creator = await prisma.creator.create({
      data: { kind: 'persona', displayName: `E2E ${creatorIds.length}` },
    });
    creatorIds.push(creator.id);
    const code = `code-${randomUUID()}`;
    const put = await fetch(
      `${base}/admin/access-codes/${encodeURIComponent(`${prefix} ${creator.id}`)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
        body: JSON.stringify({ code, target: 'creator', creatorId: creator.id, active: true }),
      },
    );
    expect(put.status).toBe(200);
    const login = await fetch(`${base}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    expect(login.status).toBe(200);
    const session = CreateSessionResponseSchema.parse(await login.json());
    // 로그인 비용(활성 코드 전부 scrypt 비교)이 쌓이지 않도록, 쓴 코드는 바로 비활성화한다.
    await prisma.accessCode.updateMany({
      where: { creatorId: creator.id },
      data: { active: false },
    });
    if (consent) {
      const res = await call('POST', '/session/consent', session.token, {
        noticeVersion: session.noticeVersion,
      });
      expect(res.status).toBe(200);
    }
    const row = await prisma.demoSession.findFirstOrThrow({
      where: { creatorId: creator.id },
      select: { id: true },
    });
    return { creatorId: creator.id, token: session.token, sessionId: row.id };
  };

  const create = (owner: Owner, body: unknown = {}, key: string = randomUUID()) =>
    call('POST', '/projects', owner.token, body, key);
  const createOk = async (owner: Owner, body: unknown = {}) => {
    const res = await create(owner, body);
    expect(res.status).toBe(201);
    return CreateProjectResponseSchema.parse(await res.json());
  };
  const list = async (owner: Owner) => {
    const res = await call('GET', '/projects', owner.token);
    expect(res.status).toBe(200);
    return ProjectListResponseSchema.parse(await res.json()).projects;
  };

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', url!);
    vi.stubEnv('AI_PROVIDER', 'mock');
    vi.stubEnv('ADMIN_TOKEN', ADMIN_TOKEN);
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    base = await app.getUrl();
    // CI 의 DB 는 시드가 없을 수 있다. 세션 e2e 와 같은 이유로 seed Creator 를 갖춘다(정리하지 않음).
    const appPrisma = app.get(PrismaService, { strict: false });
    for (const creator of SEED_CREATORS) {
      const fields = {
        kind: creator.kind,
        displayName: creator.displayName,
        seedOrder: creator.seedOrder,
      };
      await appPrisma.creator.upsert({
        where: { id: creator.id },
        update: fields,
        create: { id: creator.id, ...fields },
      });
    }
    app.get(LoginRateLimiter, { strict: false }).clear();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  });

  afterAll(async () => {
    if (prisma) {
      const sessions = await prisma.demoSession.findMany({
        where: { creatorId: { in: creatorIds } },
        select: { id: true },
      });
      const sessionIds = sessions.map((s) => s.id);
      await prisma.idempotencyRecord.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await prisma.demoSession.deleteMany({ where: { id: { in: sessionIds } } });
      await prisma.accessCode.deleteMany({ where: { creatorId: { in: creatorIds } } });
      await prisma.creator.deleteMany({ where: { id: { in: creatorIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
    vi.unstubAllEnvs();
  });

  describe('auth', () => {
    it('401 without a token', async () => {
      const res = await call('GET', '/projects');
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe('UNAUTHENTICATED');
    });

    it('403 CONSENT_REQUIRED before consent', async () => {
      const owner = await newOwner(false);
      for (const [method, path, body] of [
        ['GET', '/projects', undefined],
        ['POST', '/projects', {}],
        ['PATCH', `/projects/${randomUUID()}`, {}],
        ['DELETE', `/projects/${randomUUID()}`, undefined],
      ] as const) {
        const res = await call(method, path, owner.token, body, randomUUID());
        expect(res.status).toBe(403);
        expect(await errorCode(res)).toBe('CONSENT_REQUIRED');
      }
    });
  });

  describe('POST /projects idempotency', () => {
    it('same key twice (sequential) → 201 both, same project, one row', async () => {
      const owner = await newOwner();
      const key = randomUUID();
      const first = await create(owner, { prompt: 'A lighthouse at dawn' }, key);
      const second = await create(owner, { prompt: 'A lighthouse at dawn' }, key);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      const a = CreateProjectResponseSchema.parse(await first.json());
      const b = CreateProjectResponseSchema.parse(await second.json());
      expect(b).toEqual(a);
      expect(await prisma.project.count({ where: { ownerId: owner.creatorId } })).toBe(1);
      expect(await prisma.generationJob.count({ where: { projectId: a.project.id } })).toBe(1);
    });

    it('same key twice at once → same result, one row', async () => {
      const owner = await newOwner();
      const key = randomUUID();
      const results = await Promise.all([
        create(owner, { prompt: 'Double enter' }, key),
        create(owner, { prompt: 'Double enter' }, key),
        create(owner, { prompt: 'Double enter' }, key),
      ]);
      for (const res of results) expect(res.status).toBe(201);
      const bodies = await Promise.all(
        results.map(async (res) => CreateProjectResponseSchema.parse(await res.json())),
      );
      expect(new Set(bodies.map((b) => b.project.id)).size).toBe(1);
      expect(await prisma.project.count({ where: { ownerId: owner.creatorId } })).toBe(1);
    });

    it('same key with a different body → 409 IDEMPOTENCY_KEY_REUSED', async () => {
      const owner = await newOwner();
      const key = randomUUID();
      expect((await create(owner, { prompt: 'one' }, key)).status).toBe(201);
      const res = await create(owner, { prompt: 'two' }, key);
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await prisma.project.count({ where: { ownerId: owner.creatorId } })).toBe(1);
    });

    it('missing key → 400 IDEMPOTENCY_KEY_MISSING, bad key → 400 VALIDATION_FAILED', async () => {
      const owner = await newOwner();
      const missing = await call('POST', '/projects', owner.token, {});
      expect(missing.status).toBe(400);
      expect(await errorCode(missing)).toBe('IDEMPOTENCY_KEY_MISSING');
      const bad = await call('POST', '/projects', owner.token, {}, 'not-a-uuid');
      expect(bad.status).toBe(400);
      expect(await errorCode(bad)).toBe('VALIDATION_FAILED');
      expect(await prisma.project.count({ where: { ownerId: owner.creatorId } })).toBe(0);
    });

    it('a failed request leaves no record, so the key can be retried', async () => {
      const owner = await newOwner();
      const key = randomUUID();
      expect((await create(owner, { attachmentId: randomUUID() }, key)).status).toBe(400);
      expect(await prisma.idempotencyRecord.count({ where: { sessionId: owner.sessionId } })).toBe(
        0,
      );
      expect((await create(owner, { attachmentId: randomUUID() }, key)).status).toBe(400);
    });

    it('treats a record older than 24 hours as absent', async () => {
      const owner = await newOwner();
      const key = randomUUID();
      const first = CreateProjectResponseSchema.parse(await (await create(owner, {}, key)).json());
      await prisma.idempotencyRecord.updateMany({
        where: { sessionId: owner.sessionId, key },
        data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
      });
      const second = CreateProjectResponseSchema.parse(await (await create(owner, {}, key)).json());
      expect(second.project.id).not.toBe(first.project.id);
      expect(await prisma.project.count({ where: { ownerId: owner.creatorId } })).toBe(2);
    });
  });

  describe('POST /projects creation rules', () => {
    it('prompt → title is the first 60 chars, set and job come back, rows exist', async () => {
      const owner = await newOwner();
      const prompt = `  ${'x'.repeat(LIMITS.TITLE_MAX + 20)}  `;
      const res = await createOk(owner, { prompt });
      expect(res.project.title).toBe('x'.repeat(LIMITS.TITLE_MAX));
      expect(res.project).toMatchObject({
        status: 'building',
        posted: false,
        coverThumbUrl: null,
        kind: 'original',
        shelfPosition: 0,
      });
      expect(res.project.remixPartner).toBeUndefined();
      expect(res.set).toMatchObject({ position: 1, latestAnswer: null, answers: [] });
      expect(res.set!.prompt).toBe(prompt.trim());
      expect(res.job).toMatchObject({ status: 'pending', startStage: 'analyze', steps: [] });

      const pages = await prisma.page.findMany({ where: { projectId: res.project.id } });
      expect(pages.map((p) => p.index)).toEqual([0]);
      const sets = await prisma.promptSet.findMany({ where: { projectId: res.project.id } });
      expect(sets).toHaveLength(1);
      expect(sets[0]).toMatchObject({ position: 1, pageId: pages[0]!.id, presetKey: null });
      const jobs = await prisma.generationJob.findMany({ where: { projectId: res.project.id } });
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        id: res.job!.id,
        kind: 'create',
        status: 'pending',
        startStage: 'analyze',
        createdBySessionId: owner.sessionId,
        appliedConnectionIds: [],
      });
    });

    it('presetKey only → the preset sentence is the prompt', async () => {
      const owner = await newOwner();
      const preset = PROMPT_PRESETS[1];
      const res = await createOk(owner, { presetKey: preset.key });
      expect(res.set!.prompt).toBe(preset.prompt);
      expect(res.project.title).toBe(preset.prompt.slice(0, LIMITS.TITLE_MAX).trim());
      const set = await prisma.promptSet.findFirstOrThrow({ where: { projectId: res.project.id } });
      expect(set.presetKey).toBe(preset.key);
    });

    it('neither prompt nor preset → Untitled with one page, no set or job', async () => {
      const owner = await newOwner();
      const res = await createOk(owner, {});
      expect(res.project.title).toBe('Untitled');
      expect(res.set).toBeUndefined();
      expect(res.job).toBeUndefined();
      expect(await prisma.page.count({ where: { projectId: res.project.id } })).toBe(1);
      expect(await prisma.promptSet.count({ where: { projectId: res.project.id } })).toBe(0);
    });

    it('attachmentId → 400 VALIDATION_FAILED naming the field', async () => {
      const owner = await newOwner();
      const res = await create(owner, { prompt: 'x', attachmentId: randomUUID() });
      expect(res.status).toBe(400);
      const error = ApiErrorSchema.parse(await res.json()).error;
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(error.details)).toContain('attachmentId');
      expect(await prisma.project.count({ where: { ownerId: owner.creatorId } })).toBe(0);
    });

    it('remix partner must exist and not be yourself', async () => {
      const owner = await newOwner();
      const other = await newOwner();
      for (const remixPartnerId of [owner.creatorId, randomUUID()]) {
        const res = await create(owner, { remixPartnerId });
        expect(res.status).toBe(400);
        expect(await errorCode(res)).toBe('VALIDATION_FAILED');
      }
      const ok = await createOk(owner, { remixPartnerId: other.creatorId });
      expect(ok.project.remixPartner).toMatchObject({ id: other.creatorId, avatarUrl: null });
      const [listed] = await list(owner);
      expect(listed!.remixPartner?.id).toBe(other.creatorId);
    });

    it('rejects an empty or too long prompt', async () => {
      const owner = await newOwner();
      for (const prompt of ['', '   ', 'a'.repeat(LIMITS.PROMPT_MAX + 1)]) {
        expect((await create(owner, { prompt })).status).toBe(400);
      }
      expect((await create(owner, { prompt: 'a'.repeat(LIMITS.PROMPT_MAX) })).status).toBe(201);
    });
  });

  describe('shelf order', () => {
    it('puts new projects first and keeps numbers 0..n-1 across reorders', async () => {
      const owner = await newOwner();
      const a = await createOk(owner, { prompt: 'A' });
      const b = await createOk(owner, { prompt: 'B' });
      const c = await createOk(owner, { prompt: 'C' });
      let projects = await list(owner);
      expect(projects.map((p) => p.id)).toEqual([c.project.id, b.project.id, a.project.id]);
      expect(projects.map((p) => p.shelfPosition)).toEqual([0, 1, 2]);

      // 맨 뒤 → 맨 앞
      const move = await call('PATCH', `/projects/${a.project.id}`, owner.token, {
        shelfPosition: 0,
      });
      expect(move.status).toBe(200);
      expect(UpdateProjectResponseSchema.parse(await move.json()).project.shelfPosition).toBe(0);
      projects = await list(owner);
      expect(projects.map((p) => p.id)).toEqual([a.project.id, c.project.id, b.project.id]);
      expect(projects.map((p) => p.shelfPosition)).toEqual([0, 1, 2]);

      // 범위를 넘는 목표 → 맨 끝
      await call('PATCH', `/projects/${a.project.id}`, owner.token, { shelfPosition: 99 });
      projects = await list(owner);
      expect(projects.map((p) => p.id)).toEqual([c.project.id, b.project.id, a.project.id]);
      expect(projects.map((p) => p.shelfPosition)).toEqual([0, 1, 2]);

      // 가운데로
      await call('PATCH', `/projects/${c.project.id}`, owner.token, { shelfPosition: 1 });
      projects = await list(owner);
      expect(projects.map((p) => p.id)).toEqual([b.project.id, c.project.id, a.project.id]);

      // 새 프로젝트는 다시 맨 앞, 기존 것은 밀림
      const d = await createOk(owner, { prompt: 'D' });
      expect(d.project.shelfPosition).toBe(0);
      projects = await list(owner);
      expect(projects.map((p) => p.id)).toEqual([
        d.project.id,
        b.project.id,
        c.project.id,
        a.project.id,
      ]);
      expect(projects.map((p) => p.shelfPosition)).toEqual([0, 1, 2, 3]);
    });

    it('stays 0..n-1 without duplicates under concurrent creates and moves', async () => {
      const owner = await newOwner();
      const seeded = await Promise.all(
        Array.from({ length: 4 }, (_, i) => createOk(owner, { prompt: `seed ${i}` })),
      );
      await Promise.all([
        ...Array.from({ length: 5 }, (_, i) => create(owner, { prompt: `new ${i}` })),
        ...seeded.map((s, i) =>
          call('PATCH', `/projects/${s.project.id}`, owner.token, { shelfPosition: i }),
        ),
        call('DELETE', `/projects/${seeded[0]!.project.id}`, owner.token),
      ]);
      const projects = await list(owner);
      expect(projects).toHaveLength(8);
      expect(projects.map((p) => p.shelfPosition)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });
  });

  describe('PATCH /projects/:id', () => {
    it('title changes lastEditedAt; shelfPosition alone does not', async () => {
      const owner = await newOwner();
      const a = await createOk(owner, { prompt: 'A' });
      const b = await createOk(owner, { prompt: 'B' });
      await new Promise((resolve) => setTimeout(resolve, 20));

      const moved = await call('PATCH', `/projects/${a.project.id}`, owner.token, {
        shelfPosition: 0,
      });
      const movedBody = UpdateProjectResponseSchema.parse(await moved.json());
      expect(movedBody.project.lastEditedAt).toBe(a.project.lastEditedAt);
      const untouched = (await list(owner)).find((p) => p.id === b.project.id)!;
      expect(untouched.lastEditedAt).toBe(b.project.lastEditedAt);

      const renamed = await call('PATCH', `/projects/${a.project.id}`, owner.token, {
        title: '  New title  ',
      });
      expect(renamed.status).toBe(200);
      const renamedBody = UpdateProjectResponseSchema.parse(await renamed.json());
      expect(renamedBody.project.title).toBe('New title');
      expect(Date.parse(renamedBody.project.lastEditedAt)).toBeGreaterThan(
        Date.parse(a.project.lastEditedAt),
      );
    });

    it('an empty body returns the project unchanged', async () => {
      const owner = await newOwner();
      const a = await createOk(owner, { prompt: 'A' });
      const res = await call('PATCH', `/projects/${a.project.id}`, owner.token, {});
      expect(res.status).toBe(200);
      expect(UpdateProjectResponseSchema.parse(await res.json()).project).toEqual(a.project);
    });

    it('400 for a bad body or id, 404 for unknown', async () => {
      const owner = await newOwner();
      const a = await createOk(owner, { prompt: 'A' });
      for (const body of [
        { title: '' },
        { title: 'x'.repeat(61) },
        { shelfPosition: -1 },
        { shelfPosition: 1.5 },
      ]) {
        expect((await call('PATCH', `/projects/${a.project.id}`, owner.token, body)).status).toBe(
          400,
        );
      }
      expect((await call('PATCH', '/projects/not-a-uuid', owner.token, {})).status).toBe(400);
      const missing = await call('PATCH', `/projects/${randomUUID()}`, owner.token, {});
      expect(missing.status).toBe(404);
      expect(await errorCode(missing)).toBe('NOT_FOUND');
    });
  });

  describe('ownership and delete', () => {
    it("another owner's project: PATCH and DELETE are 403 and it is not listed", async () => {
      const mine = await newOwner();
      const theirs = await newOwner();
      const project = await createOk(theirs, { prompt: 'secret' });
      for (const res of [
        await call('PATCH', `/projects/${project.project.id}`, mine.token, { title: 'hijack' }),
        await call('DELETE', `/projects/${project.project.id}`, mine.token),
      ]) {
        expect(res.status).toBe(403);
        expect(await errorCode(res)).toBe('FORBIDDEN');
      }
      expect(await list(mine)).toEqual([]);
      expect((await list(theirs)).map((p) => p.title)).toEqual(['secret']);
    });

    it('DELETE → 204, gone from the list, remaining numbers continuous, then 404', async () => {
      const owner = await newOwner();
      const a = await createOk(owner, { prompt: 'A' });
      const b = await createOk(owner, { prompt: 'B' });
      const c = await createOk(owner, { prompt: 'C' });

      const res = await call('DELETE', `/projects/${b.project.id}`, owner.token);
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
      const projects = await list(owner);
      expect(projects.map((p) => p.id)).toEqual([c.project.id, a.project.id]);
      expect(projects.map((p) => p.shelfPosition)).toEqual([0, 1]);

      const row = await prisma.project.findUniqueOrThrow({ where: { id: b.project.id } });
      expect(row.deletedAt).not.toBeNull();

      for (const method of ['PATCH', 'DELETE']) {
        const again = await call(
          method,
          `/projects/${b.project.id}`,
          owner.token,
          method === 'PATCH' ? {} : undefined,
        );
        expect(again.status).toBe(404);
        expect(await errorCode(again)).toBe('NOT_FOUND');
      }
    });

    it('a deleted project of another owner is 404, not 403', async () => {
      const mine = await newOwner();
      const theirs = await newOwner();
      const project = await createOk(theirs, { prompt: 'gone' });
      await call('DELETE', `/projects/${project.project.id}`, theirs.token);
      const res = await call('DELETE', `/projects/${project.project.id}`, mine.token);
      expect(res.status).toBe(404);
    });

    it('DELETE with an unknown uuid is 404 and with a non-uuid is 400', async () => {
      const owner = await newOwner();
      expect((await call('DELETE', `/projects/${randomUUID()}`, owner.token)).status).toBe(404);
      expect((await call('DELETE', '/projects/nope', owner.token)).status).toBe(400);
    });
  });

  describe('GET /projects', () => {
    it('lists at most 50 projects', async () => {
      const owner = await newOwner();
      await prisma.project.createMany({
        data: Array.from({ length: 52 }, (_, i) => ({
          ownerId: owner.creatorId,
          kind: 'original' as const,
          title: `bulk ${i}`,
          shelfPosition: i,
        })),
      });
      const projects = await list(owner);
      expect(projects).toHaveLength(50);
      expect(projects[0]!.shelfPosition).toBe(0);
    });
  });
});
