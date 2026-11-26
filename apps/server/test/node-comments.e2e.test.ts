import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ApiErrorSchema,
  CreateProjectResponseSchema,
  CreateSessionResponseSchema,
  LIMITS,
  NodeCommentSchema,
} from '@tome/shared';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client';
import { LoginRateLimiter } from '../src/modules/session/login-rate-limiter';
import { PrismaService } from '../src/prisma/prisma.service';
import { SEED_CREATORS } from '../prisma/seed/creators';

// 실제 Postgres(마이그레이션 적용 완료)가 있을 때만 돈다. TEST_DATABASE_URL 이 없으면 건너뛴다.
const url = process.env.TEST_DATABASE_URL;

const ADMIN_TOKEN = 'e2e-admin-token-for-tests';

const ListSchema = z.object({ comments: z.array(NodeCommentSchema) });
const OneSchema = z.object({ comment: NodeCommentSchema });

interface Owner {
  creatorId: string;
  token: string;
}

describe.skipIf(!url)('node comments API (real Postgres)', () => {
  let app: INestApplication;
  let base: string;
  let prisma: PrismaClient;
  const runId = randomUUID();
  const prefix = `e2e-ncomments-${runId}`;
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
    expect(login.status).toBe(200);
    const session = CreateSessionResponseSchema.parse(await login.json());
    await prisma.accessCode.updateMany({
      where: { creatorId: creator.id },
      data: { active: false },
    });
    const res = await call('POST', '/session/consent', session.token, {
      noticeVersion: session.noticeVersion,
    });
    expect(res.status).toBe(200);
    return { creatorId: creator.id, token: session.token };
  };

  const snapshot = {
    schemaVersion: 1,
    subjectTemplate: 'A {subject}',
    nodes: [
      { id: 'k1', stage: 'keyword', kind: 'keyword', text: 'harbor', enabled: true, parentIds: [] },
    ],
  };
  /** 5단계 검증 기록: 기준(v1)은 코멘트를 받고, 불일치(m1)는 보기 전용이라 받지 않는다. */
  const verification = {
    status: 'done',
    criteria: [
      {
        id: 'v1',
        stage: 'verify',
        kind: 'criterion',
        text: 'Shows a harbor',
        enabled: true,
        parentIds: [],
      },
    ],
    mismatches: [
      {
        id: 'm1',
        stage: 'verify',
        kind: 'mismatch',
        text: 'No boats',
        enabled: true,
        parentIds: [],
      },
    ],
  };

  /** 프로젝트·답변을 만든다. posted 면 게시 상태. */
  const newAnswer = async (
    owner: Owner,
    opts: { posted: boolean; status?: 'draft' | 'accepted'; hidden?: boolean } = { posted: false },
  ) => {
    const res = await call(
      'POST',
      '/projects',
      owner.token,
      { prompt: 'A quiet harbor' },
      randomUUID(),
    );
    expect(res.status).toBe(201);
    const body = CreateProjectResponseSchema.parse(await res.json());
    const projectId = body.project.id;
    const setId = body.set!.id;
    await prisma.project.update({
      where: { id: projectId },
      data: {
        hiddenAt: opts.hidden ? new Date() : null,
      },
    });
    const answer = await prisma.answer.create({
      data: {
        setId,
        status: opts.status ?? 'accepted',
        origin: 'generated',
        imageKey: 'k',
        imageMode: 'generate',
        assembledPrompt: 'a',
        phrases: {},
        excluded: [],
        nodes: snapshot,
        verification,
        provider: 'mock',
        model: 'mock',
        createdById: owner.creatorId,
      },
    });
    if (opts.posted) {
      // 완료 시각이 답변 생성보다 뒤여야 남에게 보인다.
      const now = new Date();
      await prisma.project.update({
        where: { id: projectId },
        data: { finishedAt: now, postedAt: now },
      });
    }
    return { projectId, setId, answerId: answer.id };
  };

  const post = (owner: Owner, answerId: string, body: unknown, key = randomUUID()) =>
    call('POST', `/answers/${answerId}/comments`, owner.token, body, key);
  const list = async (owner: Owner, answerId: string) => {
    const res = await call('GET', `/answers/${answerId}/comments`, owner.token);
    expect(res.status).toBe(200);
    return ListSchema.parse(await res.json()).comments;
  };
  const eventCount = (answerId: string) =>
    prisma.event.count({ where: { answerId, type: 'comment_add' } });

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
  }, 60_000);

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

  it('creates, lists (oldest first, mine) and deletes a comment', async () => {
    const owner = await newOwner();
    const { answerId } = await newAnswer(owner);
    const first = await post(owner, answerId, { nodeId: 'k1', body: '  first  ' });
    expect(first.status).toBe(201);
    const created = OneSchema.parse(await first.json()).comment;
    expect(created.body).toBe('first');
    expect(created.mine).toBe(true);
    expect(created.author.id).toBe(owner.creatorId);
    await post(owner, answerId, { nodeId: 'k1', body: 'second' });

    const comments = await list(owner, answerId);
    expect(comments.map((c) => c.body)).toEqual(['first', 'second']);

    const del = await call('DELETE', `/node-comments/${created.id}`, owner.token);
    expect(del.status).toBe(204);
    expect((await list(owner, answerId)).map((c) => c.body)).toEqual(['second']);
    // 이미 지운 코멘트는 404.
    const again = await call('DELETE', `/node-comments/${created.id}`, owner.token);
    expect(again.status).toBe(404);
    expect(await errorCode(again)).toBe('NOT_FOUND');
    expect(
      (await prisma.nodeComment.findUniqueOrThrow({ where: { id: created.id } })).deletedAt,
    ).not.toBeNull();
    // 삭제는 이벤트를 남기지 않는다.
    expect(await eventCount(answerId)).toBe(2);
  });

  it('records one comment_add event in the same transaction', async () => {
    const owner = await newOwner();
    const { answerId, projectId, setId } = await newAnswer(owner);
    expect((await post(owner, answerId, { nodeId: 'k1', body: 'hi' })).status).toBe(201);
    const events = await prisma.event.findMany({ where: { answerId, type: 'comment_add' } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      projectId,
      setId,
      creatorId: owner.creatorId,
      source: 'server',
      payload: { nodeId: 'k1' },
    });
  });

  it('same idempotency key replays: one comment, one event; other body 409', async () => {
    const owner = await newOwner();
    const { answerId } = await newAnswer(owner);
    const key = randomUUID();
    const a = await post(owner, answerId, { nodeId: 'k1', body: 'once' }, key);
    const b = await post(owner, answerId, { nodeId: 'k1', body: 'once' }, key);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(await b.json()).toEqual(await a.json());
    expect(await list(owner, answerId)).toHaveLength(1);
    expect(await eventCount(answerId)).toBe(1);

    const other = await post(owner, answerId, { nodeId: 'k1', body: 'different' }, key);
    expect(other.status).toBe(409);
    expect(await errorCode(other)).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('concurrent requests with the same key create one comment', async () => {
    const owner = await newOwner();
    const { answerId } = await newAnswer(owner);
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => post(owner, answerId, { nodeId: 'k1', body: 'race' }, key)),
    );
    for (const res of results) expect(res.status).toBe(201);
    expect(await list(owner, answerId)).toHaveLength(1);
    expect(await eventCount(answerId)).toBe(1);
  });

  it('requires an idempotency key', async () => {
    const owner = await newOwner();
    const { answerId } = await newAnswer(owner);
    const res = await call('POST', `/answers/${answerId}/comments`, owner.token, {
      nodeId: 'k1',
      body: 'x',
    });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('IDEMPOTENCY_KEY_MISSING');
  });

  it('body length: 300 ok, 301 and whitespace-only rejected', async () => {
    const owner = await newOwner();
    const { answerId } = await newAnswer(owner);
    const ok = await post(owner, answerId, { nodeId: 'k1', body: 'a'.repeat(LIMITS.COMMENT_MAX) });
    expect(ok.status).toBe(201);
    for (const body of ['a'.repeat(LIMITS.COMMENT_MAX + 1), '   ', '']) {
      const res = await post(owner, answerId, { nodeId: 'k1', body });
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe('VALIDATION_FAILED');
    }
    expect(await list(owner, answerId)).toHaveLength(1);
  });

  it('rejects malformed and unknown node ids with 400, leaving no record', async () => {
    const owner = await newOwner();
    const { answerId } = await newAnswer(owner);
    for (const nodeId of ['zz', 'k999', 'K1']) {
      const key = randomUUID();
      const res = await post(owner, answerId, { nodeId, body: 'x' }, key);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe('VALIDATION_FAILED');
    }
    // 실패한 요청은 멱등 기록을 남기지 않아 같은 키로 고쳐 다시 보낼 수 있다.
    const key = randomUUID();
    expect((await post(owner, answerId, { nodeId: 'k999', body: 'x' }, key)).status).toBe(400);
    expect((await post(owner, answerId, { nodeId: 'k1', body: 'x' }, key)).status).toBe(201);
    expect(await list(owner, answerId)).toHaveLength(1);
  });

  it('accepts verification criterion ids, rejects mismatch ids', async () => {
    const owner = await newOwner();
    const { answerId } = await newAnswer(owner);
    const ok = await post(owner, answerId, { nodeId: 'v1', body: 'criterion reason' });
    expect(ok.status).toBe(201);
    expect(OneSchema.parse(await ok.json()).comment.nodeId).toBe('v1');
    const mismatch = await post(owner, answerId, { nodeId: 'm1', body: 'x' });
    expect(mismatch.status).toBe(400);
    expect(await errorCode(mismatch)).toBe('VALIDATION_FAILED');
    const unknown = await post(owner, answerId, { nodeId: 'v9', body: 'x' });
    expect(unknown.status).toBe(400);
    expect((await list(owner, answerId)).map((c) => c.nodeId)).toEqual(['v1']);
    expect(await eventCount(answerId)).toBe(1);
  });

  it("other's unposted answer: list and create are 404", async () => {
    const owner = await newOwner();
    const other = await newOwner();
    const { answerId } = await newAnswer(owner, { posted: false });
    const l = await call('GET', `/answers/${answerId}/comments`, other.token);
    expect(l.status).toBe(404);
    const c = await post(other, answerId, { nodeId: 'k1', body: 'x' });
    expect(c.status).toBe(404);
    expect(await errorCode(c)).toBe('NOT_FOUND');
    expect(await eventCount(answerId)).toBe(0);
  });

  it("other's posted project: draft answer and hidden project are 404", async () => {
    const owner = await newOwner();
    const other = await newOwner();
    const draft = await newAnswer(owner, { posted: true, status: 'draft' });
    expect((await call('GET', `/answers/${draft.answerId}/comments`, other.token)).status).toBe(
      404,
    );
    const hidden = await newAnswer(owner, { posted: true, hidden: true });
    expect((await post(other, hidden.answerId, { nodeId: 'k1', body: 'x' })).status).toBe(404);
    // 내 것은 초안이어도 읽고 쓸 수 있다.
    expect((await post(owner, draft.answerId, { nodeId: 'k1', body: 'mine' })).status).toBe(201);
  });

  it("can comment on another's posted accepted answer; mine flag differs per viewer", async () => {
    const owner = await newOwner();
    const other = await newOwner();
    const { answerId } = await newAnswer(owner, { posted: true });
    const res = await post(other, answerId, { nodeId: 'k1', body: 'nice' });
    expect(res.status).toBe(201);
    const comment = OneSchema.parse(await res.json()).comment;

    const asOwner = await list(owner, answerId);
    expect(asOwner).toHaveLength(1);
    expect(asOwner[0]!.mine).toBe(false);
    expect(asOwner[0]!.author.id).toBe(other.creatorId);
    expect((await list(other, answerId))[0]!.mine).toBe(true);

    // 남의 코멘트 삭제는 403 — 답변 주인이라도 마찬가지.
    const del = await call('DELETE', `/node-comments/${comment.id}`, owner.token);
    expect(del.status).toBe(403);
    expect(await errorCode(del)).toBe('FORBIDDEN');
    expect(await list(owner, answerId)).toHaveLength(1);
  });

  it('delete: unknown id 404, non-uuid 400, and unreadable answer hides existence (404)', async () => {
    const owner = await newOwner();
    const other = await newOwner();
    const { answerId } = await newAnswer(owner, { posted: false });
    const created = OneSchema.parse(
      await (await post(owner, answerId, { nodeId: 'k1', body: 'x' })).json(),
    ).comment;
    expect((await call('DELETE', `/node-comments/${randomUUID()}`, owner.token)).status).toBe(404);
    expect((await call('DELETE', '/node-comments/nope', owner.token)).status).toBe(400);
    expect((await call('DELETE', `/node-comments/${created.id}`, other.token)).status).toBe(404);
  });

  it('401 without a token', async () => {
    const res = await call('GET', `/answers/${randomUUID()}/comments`);
    expect(res.status).toBe(401);
  });
});
