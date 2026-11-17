import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ApiErrorSchema,
  CreateProjectResponseSchema,
  CreateSessionResponseSchema,
  LIMITS,
  WorkspaceResponseSchema,
} from '@tome/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_PROVIDER, type AiProvider, type InputCheck, MockAiProvider } from '../src/ai';
import { PrismaClient } from '../src/generated/prisma/client';
import { LoginRateLimiter } from '../src/modules/session/login-rate-limiter';
import { PrismaService } from '../src/prisma/prisma.service';
import { SEED_CREATORS } from '../prisma/seed/creators';

const url = process.env.TEST_DATABASE_URL;
const ADMIN_TOKEN = 'e2e-admin-token-for-tests';
const BAD = 'BAD-PROMPT';

/** checkInput 만 가짜: 프롬프트에 BAD 가 들어 있으면 unsafe. 호출 기록·실패 주입·neurons 를 제어한다. */
class GuardProvider implements AiProvider {
  readonly name = 'mock';
  private inner = new MockAiProvider();
  analyze: AiProvider['analyze'] = () => this.inner.analyze();
  research: AiProvider['research'] = () => this.inner.research();
  evidence: AiProvider['evidence'] = () => this.inner.evidence();
  draft: AiProvider['draft'] = () => this.inner.draft();
  image: AiProvider['image'] = () => this.inner.image();
  checks: string[] = [];
  failing = false;
  neurons = 0;
  checkInput: AiProvider['checkInput'] = async (text: string) => {
    this.checks.push(text);
    if (this.failing) throw new Error('guard down');
    const value: InputCheck = text.includes(BAD)
      ? { safe: false, categories: ['S1', 'S10'] }
      : { safe: true, categories: [] };
    return {
      value,
      provider: 'mock',
      model: 'guard',
      fallbackUsed: false,
      neurons: this.neurons,
    };
  };
  reset() {
    this.checks = [];
    this.failing = false;
    this.neurons = 0;
  }
}

interface Owner {
  creatorId: string;
  token: string;
}

describe.skipIf(!url)('input safety check (real Postgres)', () => {
  let app: INestApplication;
  let base: string;
  let prisma: PrismaClient;
  let storageDir: string;
  const ai = new GuardProvider();
  const prefix = `e2e-safety-${randomUUID()}`;
  const creatorIds: string[] = [];
  const today = () => new Date(new Date().toISOString().slice(0, 10));

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
  const errorOf = async (res: Response) => ApiErrorSchema.parse(await res.json()).error;

  const newOwner = async (): Promise<Owner> => {
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
    const session = CreateSessionResponseSchema.parse(await login.json());
    await prisma.accessCode.updateMany({
      where: { creatorId: creator.id },
      data: { active: false },
    });
    const consent = await call('POST', '/session/consent', session.token, {
      noticeVersion: session.noticeVersion,
    });
    expect(consent.status).toBe(200);
    return { creatorId: creator.id, token: session.token };
  };

  const counts = async (owner: Owner) => ({
    projects: await prisma.project.count({ where: { ownerId: owner.creatorId } }),
    sets: await prisma.promptSet.count({ where: { project: { ownerId: owner.creatorId } } }),
    jobs: await prisma.generationJob.count({ where: { project: { ownerId: owner.creatorId } } }),
  });

  const emptyProject = async (owner: Owner) => {
    const res = await call('POST', '/projects', owner.token, {}, randomUUID());
    expect(res.status).toBe(201);
    const { project } = CreateProjectResponseSchema.parse(await res.json());
    const ws = WorkspaceResponseSchema.parse(
      await (await call('GET', `/projects/${project.id}/workspace`, owner.token)).json(),
    );
    return { projectId: project.id, pageId: ws.currentPageId };
  };
  const postSet = (
    owner: Owner,
    projectId: string,
    pageId: string,
    prompt: string,
    key = randomUUID(),
  ) => call('POST', `/projects/${projectId}/sets`, owner.token, { pageId, prompt }, key);

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'tome-e2e-safety-'));
    vi.stubEnv('DATABASE_URL', url!);
    vi.stubEnv('AI_PROVIDER', 'mock');
    vi.stubEnv('ADMIN_TOKEN', ADMIN_TOKEN);
    vi.stubEnv('STORAGE_DRIVER', 'local');
    vi.stubEnv('STORAGE_LOCAL_DIR', storageDir);
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_PROVIDER)
      .useValue(ai as AiProvider)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    base = await app.getUrl();
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

  beforeEach(() => ai.reset());

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
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
  });

  describe('POST /projects', () => {
    it('blocks an unsafe prompt with 422, creates nothing, and the same key gives the same 422', async () => {
      const owner = await newOwner();
      const key = randomUUID();
      const body = { prompt: `a ${BAD} scene` };
      const first = await call('POST', '/projects', owner.token, body, key);
      expect(first.status).toBe(422);
      const err = await errorOf(first);
      expect(err.code).toBe('SAFETY_BLOCKED');
      expect(err.details).toEqual({ stage: 'input', categories: ['S1', 'S10'] });
      expect(await counts(owner)).toEqual({ projects: 0, sets: 0, jobs: 0 });

      const again = await call('POST', '/projects', owner.token, body, key);
      expect(again.status).toBe(422);
      expect((await errorOf(again)).details).toEqual(err.details);
      expect(await counts(owner)).toEqual({ projects: 0, sets: 0, jobs: 0 });
    });

    it('creates normally when safe, checks once, and does not re-check a replay', async () => {
      const owner = await newOwner();
      const key = randomUUID();
      const body = { prompt: 'a calm lighthouse' };
      expect((await call('POST', '/projects', owner.token, body, key)).status).toBe(201);
      expect(ai.checks).toEqual(['a calm lighthouse']);
      expect((await call('POST', '/projects', owner.token, body, key)).status).toBe(201);
      expect(ai.checks).toHaveLength(1);
      expect(await counts(owner)).toEqual({ projects: 1, sets: 1, jobs: 1 });
    });

    it('does not check when there is no prompt', async () => {
      const owner = await newOwner();
      expect((await call('POST', '/projects', owner.token, {}, randomUUID())).status).toBe(201);
      expect(ai.checks).toHaveLength(0);
    });

    it('passes through when the check call fails', async () => {
      const owner = await newOwner();
      ai.failing = true;
      const res = await call('POST', '/projects', owner.token, { prompt: BAD }, randomUUID());
      expect(res.status).toBe(201);
      expect(ai.checks).toHaveLength(1);
    });

    it('checks before the usage limit (unsafe → 422, safe → 429)', async () => {
      const owner = await newOwner();
      const date = today();
      const before = await prisma.usageDaily.findUnique({ where: { date } });
      await prisma.usageDaily.upsert({
        where: { date },
        update: { neuronsEst: 1e9 },
        create: { date, neuronsEst: 1e9 },
      });
      try {
        const blocked = await call('POST', '/projects', owner.token, { prompt: BAD }, randomUUID());
        expect(blocked.status).toBe(422);
        expect((await errorOf(blocked)).code).toBe('SAFETY_BLOCKED');
        const limited = await call(
          'POST',
          '/projects',
          owner.token,
          { prompt: 'a fine prompt' },
          randomUUID(),
        );
        expect(limited.status).toBe(429);
        expect(ai.checks).toHaveLength(2);
      } finally {
        if (before) {
          await prisma.usageDaily.update({
            where: { date },
            data: { neuronsEst: before.neuronsEst },
          });
        } else {
          await prisma.usageDaily.deleteMany({ where: { date } });
        }
      }
    });

    it('adds the check neurons to today usage, also for a blocked request', async () => {
      const owner = await newOwner();
      const date = today();
      const read = async () => {
        const row = await prisma.usageDaily.findUnique({ where: { date } });
        return { neurons: Number(row?.neuronsEst ?? 0), text: row?.textCalls ?? 0 };
      };
      const before = await read();
      ai.neurons = 7;
      const res = await call('POST', '/projects', owner.token, { prompt: BAD }, randomUUID());
      expect(res.status).toBe(422);
      const after = await read();
      expect(after.neurons - before.neurons).toBeCloseTo(7, 3);
      expect(after.text - before.text).toBe(1);
    });
  });

  describe('POST /projects/:id/sets', () => {
    it('blocks an unsafe prompt with 422, creates no set or job, and the same key gives the same 422', async () => {
      const owner = await newOwner();
      const { projectId, pageId } = await emptyProject(owner);
      const key = randomUUID();
      const first = await postSet(owner, projectId, pageId, `x ${BAD}`, key);
      expect(first.status).toBe(422);
      const err = await errorOf(first);
      expect(err.code).toBe('SAFETY_BLOCKED');
      expect(err.details).toEqual({ stage: 'input', categories: ['S1', 'S10'] });
      expect(await counts(owner)).toEqual({ projects: 1, sets: 0, jobs: 0 });
      const again = await postSet(owner, projectId, pageId, `x ${BAD}`, key);
      expect(again.status).toBe(422);
      expect(await counts(owner)).toEqual({ projects: 1, sets: 0, jobs: 0 });
    });

    it('creates normally when safe and skips the check on a replay', async () => {
      const owner = await newOwner();
      const { projectId, pageId } = await emptyProject(owner);
      const key = randomUUID();
      expect((await postSet(owner, projectId, pageId, 'a harbor', key)).status).toBe(201);
      expect((await postSet(owner, projectId, pageId, 'a harbor', key)).status).toBe(201);
      expect(ai.checks).toEqual(['a harbor']);
    });

    it('returns 409 for a full page before any check call', async () => {
      const owner = await newOwner();
      const { projectId, pageId } = await emptyProject(owner);
      for (let i = 0; i < LIMITS.SETS_PER_PAGE; i += 1) {
        await prisma.promptSet.create({
          data: { projectId, pageId, position: i + 1, prompt: `p${i}` },
        });
      }
      const res = await postSet(owner, projectId, pageId, BAD);
      expect(res.status).toBe(409);
      expect((await errorOf(res)).code).toBe('SET_LIMIT_REACHED');
      expect(ai.checks).toHaveLength(0);
    });

    it('rejects other people and missing projects before any check call', async () => {
      const owner = await newOwner();
      const other = await newOwner();
      const { projectId, pageId } = await emptyProject(owner);
      expect((await postSet(other, projectId, pageId, 'x')).status).toBe(403);
      expect((await postSet(owner, randomUUID(), pageId, 'x')).status).toBe(404);
      expect(ai.checks).toHaveLength(0);
    });

    it('passes through when the check call fails', async () => {
      const owner = await newOwner();
      const { projectId, pageId } = await emptyProject(owner);
      ai.failing = true;
      expect((await postSet(owner, projectId, pageId, BAD)).status).toBe(201);
    });

    it('concurrent requests with one key produce one set', async () => {
      const owner = await newOwner();
      const { projectId, pageId } = await emptyProject(owner);
      const key = randomUUID();
      const results = await Promise.all(
        [1, 2, 3].map(() => postSet(owner, projectId, pageId, 'a bridge', key)),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect((await counts(owner)).sets).toBe(1);
    });
  });
});
