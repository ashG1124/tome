import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ApiErrorSchema,
  type ClientEventType,
  CreateProjectResponseSchema,
  CreateSessionResponseSchema,
  EventBatchResponseSchema,
  LIMITS,
} from '@tome/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client';
import { EventsRepository } from '../src/modules/events/events.repository';
import { EventsService } from '../src/modules/events/events.service';
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

describe.skipIf(!url)('events API (real Postgres)', () => {
  let app: INestApplication;
  let base: string;
  let prisma: PrismaClient;
  const runId = randomUUID();
  const prefix = `e2e-events-${runId}`;
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
  const errorBody = async (res: Response) => ApiErrorSchema.parse(await res.json()).error;

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

  const createProject = async (owner: Owner) => {
    const res = await call(
      'POST',
      '/projects',
      owner.token,
      { prompt: 'A quiet harbor' },
      randomUUID(),
    );
    expect(res.status).toBe(201);
    const body = CreateProjectResponseSchema.parse(await res.json());
    return { projectId: body.project.id, setId: body.set!.id };
  };

  const newAnswer = (setId: string, creatorId: string) =>
    prisma.answer.create({
      data: {
        setId,
        status: 'draft',
        origin: 'generated',
        imageKey: 'k',
        imageMode: 'generate',
        assembledPrompt: 'a',
        phrases: {},
        excluded: [],
        nodes: {},
        provider: 'mock',
        model: 'mock',
        createdById: creatorId,
      },
    });

  const event = (type: ClientEventType, extra: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    schemaVersion: 1,
    type,
    clientTs: new Date().toISOString(),
    payload: type === 'prompt_submit' ? { hasAttachment: false } : {},
    ...extra,
  });
  const send = (owner: Owner, events: unknown[]) =>
    call('POST', '/events', owner.token, { events });
  const sendOk = async (owner: Owner, events: unknown[]) => {
    const res = await send(owner, events);
    expect(res.status).toBe(200);
    return EventBatchResponseSchema.parse(await res.json());
  };
  const count = (owner: Owner) => prisma.event.count({ where: { creatorId: owner.creatorId } });

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
      // Creator 삭제로 프로젝트·이벤트가 함께 지워진다.
      await prisma.creator.deleteMany({ where: { id: { in: creatorIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
    vi.unstubAllEnvs();
  });

  it('401 without a token', async () => {
    const res = await call('POST', '/events', undefined, { events: [] });
    expect(res.status).toBe(401);
  });

  it('403 CONSENT_REQUIRED before consent, nothing stored', async () => {
    const owner = await newOwner(false);
    const res = await send(owner, [event('page_add')]);
    expect(res.status).toBe(403);
    expect((await errorBody(res)).code).toBe('CONSENT_REQUIRED');
    expect(await count(owner)).toBe(0);
  });

  it('stores an event with server-filled fields', async () => {
    const owner = await newOwner();
    const e = event('page_add');
    expect(await sendOk(owner, [e])).toEqual({ accepted: 1, duplicates: 0 });
    const row = await prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(row).toMatchObject({
      creatorId: owner.creatorId,
      sessionId: owner.sessionId,
      source: 'client',
      type: 'page_add',
      schemaVersion: 1,
    });
    expect(row.clientTs?.toISOString()).toBe(e.clientTs);
    expect(row.serverTs).toBeInstanceOf(Date);
  });

  it('accepts an empty batch', async () => {
    const owner = await newOwner();
    expect(await sendOk(owner, [])).toEqual({ accepted: 0, duplicates: 0 });
  });

  describe('duplicates', () => {
    it('same event twice (sequential) → stored once, second says duplicates 1', async () => {
      const owner = await newOwner();
      const e = event('node_open');
      expect(await sendOk(owner, [e])).toEqual({ accepted: 1, duplicates: 0 });
      expect(await sendOk(owner, [e])).toEqual({ accepted: 0, duplicates: 1 });
      expect(await count(owner)).toBe(1);
    });

    it('same event twice at once → stored once', async () => {
      const owner = await newOwner();
      const e = event('node_close');
      const results = await Promise.all([sendOk(owner, [e]), sendOk(owner, [e])]);
      expect(results.reduce((sum, r) => sum + r.accepted, 0)).toBe(1);
      expect(results.reduce((sum, r) => sum + r.duplicates, 0)).toBe(1);
      expect(await count(owner)).toBe(1);
    });

    it('same id repeated inside one batch counts once', async () => {
      const owner = await newOwner();
      const e = event('page_switch');
      expect(await sendOk(owner, [e, e, event('page_add')])).toEqual({
        accepted: 2,
        duplicates: 1,
      });
      expect(await count(owner)).toBe(2);
    });
  });

  describe('validation', () => {
    it('50 events pass, 51 → 400 VALIDATION_FAILED, nothing stored', async () => {
      const owner = await newOwner();
      const make = (n: number) => Array.from({ length: n }, () => event('page_add'));
      expect(await sendOk(owner, make(LIMITS.EVENT_BATCH_MAX))).toEqual({
        accepted: 50,
        duplicates: 0,
      });
      const before = await count(owner);
      const res = await send(owner, make(LIMITS.EVENT_BATCH_MAX + 1));
      expect(res.status).toBe(400);
      expect((await errorBody(res)).code).toBe('VALIDATION_FAILED');
      expect(await count(owner)).toBe(before);
    });

    it('a server event type rejects the whole batch with the field path', async () => {
      const owner = await newOwner();
      const res = await send(owner, [
        event('page_add'),
        { ...event('page_add'), type: 'version_save' },
      ]);
      expect(res.status).toBe(400);
      const error = await errorBody(res);
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(error.details)).toContain('events.1.type');
      expect(await count(owner)).toBe(0);
    });

    it('bad payload or unknown type → 400', async () => {
      const owner = await newOwner();
      const badPayload = { ...event('prompt_submit'), payload: {} };
      expect((await send(owner, [badPayload])).status).toBe(400);
      expect((await send(owner, [{ ...event('page_add'), type: 'nope' }])).status).toBe(400);
      expect(await count(owner)).toBe(0);
    });
  });

  describe('targets', () => {
    it('full round: create project, send events per type, count by type', async () => {
      const owner = await newOwner();
      const { projectId, setId } = await createProject(owner);
      const answer = await newAnswer(setId, owner.creatorId);
      const types: ClientEventType[] = [
        'prompt_submit',
        'canvas_revealed',
        'node_open',
        'node_open',
        'node_close',
        'weight_apply',
        'draft_apply',
      ];
      const events = types.map((type, i) =>
        event(type, i % 2 === 0 ? { projectId, setId } : { projectId, setId, answerId: answer.id }),
      );
      expect(await sendOk(owner, events)).toEqual({ accepted: 7, duplicates: 0 });
      const grouped = await prisma.event.groupBy({
        by: ['type'],
        where: { creatorId: owner.creatorId, projectId },
        _count: true,
      });
      const byType = Object.fromEntries(grouped.map((g) => [g.type, g._count]));
      expect(byType).toEqual({
        prompt_submit: 1,
        canvas_revealed: 1,
        node_open: 2,
        node_close: 1,
        weight_apply: 1,
        draft_apply: 1,
      });
    });

    it('fills projectId from setId and from answerId when omitted', async () => {
      const owner = await newOwner();
      const { projectId, setId } = await createProject(owner);
      const answer = await newAnswer(setId, owner.creatorId);
      const bySet = event('node_open', { setId });
      const byAnswer = event('node_open', { answerId: answer.id });
      expect(await sendOk(owner, [bySet, byAnswer])).toMatchObject({ accepted: 2 });
      const rows = await prisma.event.findMany({ where: { id: { in: [bySet.id, byAnswer.id] } } });
      for (const row of rows) expect(row).toMatchObject({ projectId, setId });
    });

    it("drops only events pointing at someone else's unposted project, or unknown ids", async () => {
      const owner = await newOwner();
      const other = await newOwner();
      const mine = await createProject(owner);
      const theirs = await createProject(other);
      const theirAnswer = await newAnswer(theirs.setId, other.creatorId);
      const ok = event('page_add', { projectId: mine.projectId });
      const res = await sendOk(owner, [
        ok,
        event('node_open', { projectId: theirs.projectId }),
        event('node_open', { setId: theirs.setId }),
        event('node_open', { answerId: theirAnswer.id }),
        event('node_open', { projectId: randomUUID() }),
        event('page_add'),
      ]);
      expect(res).toEqual({ accepted: 2, duplicates: 0 });
      expect(await count(owner)).toBe(2);
    });

    it("accepts events on someone else's posted project", async () => {
      const owner = await newOwner();
      const other = await newOwner();
      const theirs = await createProject(other);
      await prisma.project.update({
        where: { id: theirs.projectId },
        data: { postedAt: new Date() },
      });
      expect(
        await sendOk(owner, [
          event('node_open', { projectId: theirs.projectId, setId: theirs.setId }),
        ]),
      ).toEqual({ accepted: 1, duplicates: 0 });
    });

    it('drops events for deleted or hidden projects', async () => {
      const owner = await newOwner();
      const deleted = await createProject(owner);
      const hidden = await createProject(owner);
      await prisma.project.update({
        where: { id: deleted.projectId },
        data: { deletedAt: new Date() },
      });
      await prisma.project.update({
        where: { id: hidden.projectId },
        data: { hiddenAt: new Date() },
      });
      const res = await sendOk(owner, [
        event('node_open', { projectId: deleted.projectId }),
        event('node_open', { projectId: hidden.projectId, setId: hidden.setId }),
      ]);
      expect(res).toEqual({ accepted: 0, duplicates: 0 });
    });

    it('drops events whose ids do not belong together', async () => {
      const owner = await newOwner();
      const a = await createProject(owner);
      const b = await createProject(owner);
      const answerB = await newAnswer(b.setId, owner.creatorId);
      const res = await sendOk(owner, [
        event('node_open', { projectId: a.projectId, setId: b.setId }),
        event('node_open', { setId: a.setId, answerId: answerB.id }),
        event('node_open', { projectId: a.projectId, answerId: answerB.id }),
        event('node_open', { projectId: b.projectId, setId: b.setId, answerId: answerB.id }),
      ]);
      expect(res).toEqual({ accepted: 1, duplicates: 0 });
    });

    it('keeps events when the project is soft-deleted afterwards; listForCreator can filter', async () => {
      const owner = await newOwner();
      const { projectId, setId } = await createProject(owner);
      const kept = event('node_open', { projectId, setId });
      const free = event('page_add');
      await sendOk(owner, [kept, free]);
      await prisma.project.update({ where: { id: projectId }, data: { deletedAt: new Date() } });
      expect(await count(owner)).toBe(2);
      const repo = app.get(EventsRepository, { strict: false });
      const visible = await repo.listForCreator(owner.creatorId);
      expect(visible.map((r) => r.id)).toEqual([free.id]);
      const all = await repo.listForCreator(owner.creatorId, { includeRemovedProjects: true });
      expect(all.map((r) => r.id).sort()).toEqual([kept.id, free.id].sort());
    });

    it('has no update or delete routes', async () => {
      const owner = await newOwner();
      for (const method of ['PATCH', 'PUT', 'DELETE']) {
        const res = await call(method, `/events/${randomUUID()}`, owner.token, {});
        expect(res.status).toBe(404);
      }
    });
  });

  describe('recordServerEvent', () => {
    it('is stored when the transaction commits', async () => {
      const owner = await newOwner();
      const { projectId, setId } = await createProject(owner);
      const service = app.get(EventsService, { strict: false });
      const appPrisma = app.get(PrismaService, { strict: false });
      await appPrisma.$transaction((tx) =>
        service.recordServerEvent(tx, {
          type: 'project_finish',
          creatorId: owner.creatorId,
          sessionId: owner.sessionId,
          projectId,
          setId,
          payload: { n: 1 },
        }),
      );
      const row = await prisma.event.findFirstOrThrow({ where: { creatorId: owner.creatorId } });
      expect(row).toMatchObject({
        type: 'project_finish',
        source: 'server',
        projectId,
        setId,
        sessionId: owner.sessionId,
        payload: { n: 1 },
      });
      expect(row.clientTs?.getTime()).toBe(row.serverTs.getTime());
    });

    it('is not stored when the transaction rolls back', async () => {
      const owner = await newOwner();
      const service = app.get(EventsService, { strict: false });
      const appPrisma = app.get(PrismaService, { strict: false });
      await expect(
        appPrisma.$transaction(async (tx) => {
          await service.recordServerEvent(tx, {
            type: 'pin_toggle',
            creatorId: owner.creatorId,
            sessionId: null,
          });
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await count(owner)).toBe(0);
    });

    it('rejects a payload that breaks the type schema', async () => {
      const owner = await newOwner();
      const service = app.get(EventsService, { strict: false });
      const appPrisma = app.get(PrismaService, { strict: false });
      await expect(
        appPrisma.$transaction((tx) =>
          service.recordServerEvent(tx, {
            type: 'project_post',
            creatorId: owner.creatorId,
            sessionId: null,
            payload: 'nope' as unknown as Record<string, unknown>,
          }),
        ),
      ).rejects.toThrow();
      expect(await count(owner)).toBe(0);
    });
  });
});
