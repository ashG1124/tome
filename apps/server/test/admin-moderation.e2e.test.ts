import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AdminResetResponseSchema,
  ApiErrorSchema,
  CommentListResponseSchema,
  CreateSessionResponseSchema,
} from '@tome/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client';
import { LoginRateLimiter } from '../src/modules/session/login-rate-limiter';
import { seedCreatorIds } from '../src/seed/creators';
import { upsertSeedCreators } from '../src/seed/load';

const url = process.env.TEST_DATABASE_URL;
const ADMIN_TOKEN = 'e2e-admin-token-for-tests';
const CONFIRM = 'DELETE VISITOR DATA';

describe.skipIf(!url)('admin moderation API (real Postgres)', () => {
  let app: INestApplication;
  let base: string;
  let prisma: PrismaClient;
  let storageDir: string;
  const prefix = `e2e-mod-${randomUUID()}`;
  const creatorIds: string[] = [];
  const projectIds: string[] = [];
  const visitorIds = seedCreatorIds('visitor');

  const call = (method: string, path: string, token?: string, body?: unknown) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const admin = (path: string, body: unknown, token: string | null = ADMIN_TOKEN) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-admin-token': token } : {}),
      },
      body: JSON.stringify(body),
    });
  const errorCode = async (res: Response) => ApiErrorSchema.parse(await res.json()).error.code;

  const loginAs = async (creatorId: string) => {
    const code = `code-${randomUUID()}`;
    const put = await fetch(
      `${base}/admin/access-codes/${encodeURIComponent(`${prefix} ${creatorId}`)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
        body: JSON.stringify({ code, target: 'creator', creatorId, active: true }),
      },
    );
    expect(put.status).toBe(200);
    const login = await fetch(`${base}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const session = CreateSessionResponseSchema.parse(await login.json());
    await prisma.accessCode.updateMany({ where: { creatorId }, data: { active: false } });
    const consent = await call('POST', '/session/consent', session.token, {
      noticeVersion: session.noticeVersion,
    });
    expect(consent.status).toBe(200);
    return session.token;
  };
  const newPersona = async () => {
    const creator = await prisma.creator.create({
      data: { kind: 'persona', displayName: 'E2E moderation' },
    });
    creatorIds.push(creator.id);
    return { creatorId: creator.id, token: await loginAs(creator.id) };
  };
  const newPublicProject = async (ownerId: string) => {
    const id = randomUUID();
    await prisma.project.create({
      data: {
        id,
        ownerId,
        kind: 'original',
        title: 'Moderation fixture',
        status: 'finished',
        finishedAt: new Date(),
        postedAt: new Date(),
        selectionReason: 'Calm light',
        shelfPosition: 0,
        pages: { create: { index: 0 } },
      },
    });
    projectIds.push(id);
    return id;
  };
  const shelfIds = async (token: string) => {
    const res = await call('GET', '/projects', token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { projects: { id: string }[] };
    return body.projects.map((p) => p.id);
  };

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'tome-e2e-mod-'));
    vi.stubEnv('DATABASE_URL', url!);
    vi.stubEnv('AI_PROVIDER', 'mock');
    vi.stubEnv('ADMIN_TOKEN', ADMIN_TOKEN);
    vi.stubEnv('STORAGE_DRIVER', 'local');
    vi.stubEnv('STORAGE_LOCAL_DIR', storageDir);
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    base = await app.getUrl();
    app.get(LoginRateLimiter, { strict: false }).clear();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    await prisma.$transaction((tx) => upsertSeedCreators(tx), { timeout: 60_000 });
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
      const everyone = [...creatorIds, ...visitorIds];
      const sessions = await prisma.demoSession.findMany({
        where: { creatorId: { in: everyone } },
        select: { id: true },
      });
      const sessionIds = sessions.map((s) => s.id);
      await prisma.idempotencyRecord.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await prisma.demoSession.deleteMany({ where: { id: { in: sessionIds } } });
      await prisma.accessCode.deleteMany({ where: { label: { startsWith: prefix } } });
      await prisma.creator.deleteMany({ where: { id: { in: creatorIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
    vi.unstubAllEnvs();
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
  });

  it('rejects a missing or wrong admin token on all three endpoints', async () => {
    const id = randomUUID();
    for (const [path, body] of [
      [`/admin/projects/${id}/hide`, { hidden: true }],
      [`/admin/comments/${id}/hide`, { hidden: true }],
      ['/admin/purge-visitors', { confirm: CONFIRM }],
    ] as const) {
      for (const token of [null, 'wrong']) {
        const res = await admin(path, body, token);
        expect(res.status).toBe(401);
        expect(await errorCode(res)).toBe('ADMIN_TOKEN_INVALID');
      }
    }
  });

  it('hides a posted project from everyone (owner included) and restores it on unhide', async () => {
    const owner = await newPersona();
    const other = await newPersona();
    const id = await newPublicProject(owner.creatorId);
    expect((await call('GET', `/agora/projects/${id}`, other.token)).status).toBe(200);
    expect(await shelfIds(owner.token)).toContain(id);
    expect((await call('GET', `/projects/${id}/finish-candidates`, owner.token)).status).not.toBe(
      404,
    );

    const hide = await admin(`/admin/projects/${id}/hide`, { hidden: true });
    expect(hide.status).toBe(204);
    const first = (await prisma.project.findUniqueOrThrow({ where: { id } })).hiddenAt;
    expect(first).not.toBeNull();
    expect((await call('GET', `/agora/projects/${id}`, other.token)).status).toBe(404);
    expect(await shelfIds(owner.token)).not.toContain(id);
    expect((await call('GET', `/projects/${id}/finish-candidates`, owner.token)).status).toBe(404);

    // 다시 숨겨도 첫 시각이 그대로다.
    expect((await admin(`/admin/projects/${id}/hide`, { hidden: true })).status).toBe(204);
    expect((await prisma.project.findUniqueOrThrow({ where: { id } })).hiddenAt).toEqual(first);

    expect((await admin(`/admin/projects/${id}/hide`, { hidden: false })).status).toBe(204);
    expect((await prisma.project.findUniqueOrThrow({ where: { id } })).hiddenAt).toBeNull();
    expect((await call('GET', `/agora/projects/${id}`, other.token)).status).toBe(200);
    expect(await shelfIds(owner.token)).toContain(id);
  });

  it('can hide a project the owner already deleted', async () => {
    const owner = await newPersona();
    const id = await newPublicProject(owner.creatorId);
    await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
    expect((await admin(`/admin/projects/${id}/hide`, { hidden: true })).status).toBe(204);
    expect((await prisma.project.findUniqueOrThrow({ where: { id } })).hiddenAt).not.toBeNull();
  });

  it('hides and restores an agora comment in the comment list', async () => {
    const owner = await newPersona();
    const other = await newPersona();
    const id = await newPublicProject(owner.creatorId);
    const comment = await prisma.agoraComment.create({
      data: { projectId: id, authorId: other.creatorId, body: 'visible note' },
    });
    const ids = async () =>
      CommentListResponseSchema.parse(
        await (await call('GET', `/projects/${id}/comments`, owner.token)).json(),
      ).comments.map((c) => c.id);
    expect(await ids()).toContain(comment.id);

    expect((await admin(`/admin/comments/${comment.id}/hide`, { hidden: true })).status).toBe(204);
    expect(await ids()).not.toContain(comment.id);
    expect((await admin(`/admin/comments/${comment.id}/hide`, { hidden: false })).status).toBe(204);
    expect(await ids()).toContain(comment.id);
  });

  it('answers 404 for unknown ids, 400 for non-uuid ids and bad bodies', async () => {
    const missing = randomUUID();
    for (const kind of ['projects', 'comments']) {
      const res = await admin(`/admin/${kind}/${missing}/hide`, { hidden: true });
      expect(res.status).toBe(404);
      expect(await errorCode(res)).toBe('NOT_FOUND');

      const bad = await admin(`/admin/${kind}/not-a-uuid/hide`, { hidden: true });
      expect(bad.status).toBe(400);
      expect(await errorCode(bad)).toBe('VALIDATION_FAILED');

      for (const body of [{}, { hidden: 'yes' }, { hidden: true, extra: 1 }]) {
        const res2 = await admin(`/admin/${kind}/${missing}/hide`, body);
        expect(res2.status).toBe(400);
        expect(await errorCode(res2)).toBe('VALIDATION_FAILED');
      }
    }
  });

  it('purge-visitors rejects a wrong confirmation and deletes nothing', async () => {
    const visitor = visitorIds[0]!;
    const id = await newPublicProject(visitor);
    for (const body of [
      {},
      { confirm: '' },
      { confirm: 'delete visitor data' },
      { confirm: ` ${CONFIRM}` },
      { confirm: `${CONFIRM} ` },
      { confirm: CONFIRM, extra: 1 },
    ]) {
      const res = await admin('/admin/purge-visitors', body);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe('VALIDATION_FAILED');
    }
    expect(await prisma.project.count({ where: { id } })).toBe(1);
  });

  it('purge-visitors clears visitor data but keeps accounts, seed and persona data', async () => {
    const visitor = visitorIds[0]!;
    const token = await loginAs(visitor);
    const stranger = await newPersona();
    const mine = await newPublicProject(visitor);
    const theirs = await newPublicProject(stranger.creatorId);
    await prisma.agoraComment.create({
      data: { projectId: theirs, authorId: visitor, body: 'visitor note' },
    });
    const keepIds = [...seedCreatorIds('seed'), ...seedCreatorIds('persona'), stranger.creatorId];
    const keepBefore = await prisma.project.count({ where: { ownerId: { in: keepIds } } });
    const visitorProjects = await prisma.project.count({ where: { ownerId: { in: visitorIds } } });
    expect(visitorProjects).toBeGreaterThanOrEqual(1);
    expect((await call('GET', '/me', token)).status).toBe(200);

    const res = await admin('/admin/purge-visitors', { confirm: CONFIRM });
    expect(res.status).toBe(200);
    const body = AdminResetResponseSchema.parse(await res.json());
    expect(body.deleted).toBe(visitorProjects);

    expect(await prisma.project.count({ where: { id: mine } })).toBe(0);
    expect(await prisma.project.count({ where: { ownerId: { in: visitorIds } } })).toBe(0);
    expect(await prisma.agoraComment.count({ where: { authorId: { in: visitorIds } } })).toBe(0);
    expect(await prisma.demoSession.count({ where: { creatorId: { in: visitorIds } } })).toBe(0);
    expect(await prisma.creator.count({ where: { id: { in: visitorIds } } })).toBe(5);
    expect(await prisma.project.count({ where: { ownerId: { in: keepIds } } })).toBe(keepBefore);
  });
});
