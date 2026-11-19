import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AgoraHomeResponseSchema,
  AgoraProjectResponseSchema,
  ApiErrorSchema,
  CommentListResponseSchema,
  CreateAgoraCommentResponseSchema,
  CreateSessionResponseSchema,
  DeriveProjectResponseSchema,
  LIMITS,
  TopicResponseSchema,
} from '@tome/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client';
import { LoginRateLimiter } from '../src/modules/session/login-rate-limiter';
import { OBJECT_STORAGE, type ObjectStorage } from '../src/storage';

// 실제 Postgres(마이그레이션 적용 완료)가 있을 때만 돈다. TEST_DATABASE_URL 이 없으면 건너뛴다.
const url = process.env.TEST_DATABASE_URL;
const ADMIN_TOKEN = 'e2e-admin-token-for-tests';

interface Who {
  creatorId: string;
  sessionId: string;
  token: string;
}

const snapshot = {
  schemaVersion: 1,
  subjectTemplate: 'A {subject}',
  nodes: [
    { id: 'k1', stage: 'analyze', kind: 'keyword', text: 'harbor', enabled: true, parentIds: [] },
  ],
};

describe.skipIf(!url)('agora API (real Postgres)', () => {
  let app: INestApplication;
  let base: string;
  let prisma: PrismaClient;
  let storage: ObjectStorage;
  const runId = randomUUID();
  const prefix = `e2e-agora-${runId}`;
  const creatorIds: string[] = [];
  const projectIds: string[] = [];
  const topicIds: string[] = [];
  const storedKeys: string[] = [];

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

  const newWho = async (seedOrder?: number): Promise<Who> => {
    const creator = await prisma.creator.create({
      data: { kind: 'persona', displayName: `E2E ${creatorIds.length}`, seedOrder },
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
    const res = await call('POST', '/session/consent', session.token, {
      noticeVersion: session.noticeVersion,
    });
    expect(res.status).toBe(200);
    const row = await prisma.demoSession.findFirstOrThrow({ where: { creatorId: creator.id } });
    return { creatorId: creator.id, sessionId: row.id, token: session.token };
  };

  /** 완료·게시된 프로젝트(대표 답변 1개 + 이미지 객체)를 직접 만든다. */
  const newPublic = async (
    owner: Who,
    opts: {
      title?: string;
      postedAt?: Date;
      topicId?: string;
      stat?: { viewCount?: number; remixCount?: number; deriveCount?: number; likeCount?: number };
      posted?: boolean;
      derivedFromProjectId?: string;
    } = {},
  ) => {
    const id = randomUUID();
    const answerId = randomUUID();
    const imageKey = `answers/${answerId}/full.png`;
    await storage.put(imageKey, new Uint8Array([1, 2, 3, 4]), 'image/png');
    storedKeys.push(imageKey);
    const finishedAt = new Date(Date.now() + 1000);
    const project = await prisma.project.create({
      data: {
        id,
        ownerId: owner.creatorId,
        kind: opts.derivedFromProjectId ? 'derive' : 'original',
        derivedFromProjectId: opts.derivedFromProjectId,
        title: opts.title ?? 'Harbor',
        status: 'finished',
        finishedAt,
        postedAt: opts.posted === false ? null : (opts.postedAt ?? new Date()),
        selectionReason: 'Calm light',
        shelfPosition: 0,
        topicId: opts.topicId,
        pages: { create: { index: 0 } },
      },
      include: { pages: true },
    });
    projectIds.push(id);
    const set = await prisma.promptSet.create({
      data: { projectId: id, pageId: project.pages[0]!.id, position: 1, prompt: 'A quiet harbor' },
    });
    await prisma.answer.create({
      data: {
        id: answerId,
        setId: set.id,
        status: 'accepted',
        number: 1,
        origin: 'generated',
        imageKey,
        imageMode: 'generate',
        assembledPrompt: 'a',
        phrases: {},
        excluded: [],
        nodes: snapshot,
        provider: 'mock',
        model: 'mock',
        createdById: owner.creatorId,
      },
    });
    // 이 답변은 완료 시각 이후에 만든 것으로 취급되지 않게 생성 시각을 과거로 둔다.
    await prisma.answer.update({
      where: { id: answerId },
      data: { createdAt: new Date(Date.now() - 1000) },
    });
    await prisma.project.update({ where: { id }, data: { coverAnswerId: answerId } });
    if (opts.stat) await prisma.projectStat.create({ data: { projectId: id, ...opts.stat } });
    return { id, answerId, setId: set.id };
  };

  const newTopic = async (title: string) => {
    const max = await prisma.topic.aggregate({ _max: { seedOrder: true } });
    const topic = await prisma.topic.create({
      data: { title, seedOrder: (max._max.seedOrder ?? 0) + 1 },
    });
    topicIds.push(topic.id);
    return topic;
  };

  const home = async (who: Who) => {
    const res = await call('GET', '/agora', who.token);
    expect(res.status).toBe(200);
    return AgoraHomeResponseSchema.parse(await res.json());
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
    storage = app.get<ObjectStorage>(OBJECT_STORAGE, { strict: false });
    app.get(LoginRateLimiter, { strict: false }).clear();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      const derived = await prisma.answer.findMany({
        where: { copiedFromAnswerId: { not: null }, createdById: { in: creatorIds } },
        select: { imageKey: true },
      });
      for (const a of derived) storedKeys.push(a.imageKey);
      const sessions = await prisma.demoSession.findMany({
        where: { creatorId: { in: creatorIds } },
        select: { id: true },
      });
      const sessionIds = sessions.map((s) => s.id);
      await prisma.idempotencyRecord.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await prisma.demoSession.deleteMany({ where: { id: { in: sessionIds } } });
      await prisma.accessCode.deleteMany({ where: { creatorId: { in: creatorIds } } });
      await prisma.creator.deleteMany({ where: { id: { in: creatorIds } } }); // 프로젝트·댓글·이벤트 연쇄
      await prisma.topic.deleteMany({ where: { id: { in: topicIds } } });
      await prisma.$disconnect();
    }
    for (const key of storedKeys) await storage?.delete(key).catch(() => undefined);
    await app?.close();
    vi.unstubAllEnvs();
  });

  it('fills the home with public projects only, ranked by score then recency', async () => {
    const a = await newWho();
    const b = await newWho();
    const viewer = await newWho();
    const old = new Date(Date.now() - 3600_000);
    const top = await newPublic(a, { stat: { viewCount: 10_000_000, remixCount: 1 } });
    const tieOld = await newPublic(a, { postedAt: old, stat: { viewCount: 5_000_000 } });
    const tieNew = await newPublic(b, { stat: { viewCount: 5_000_000 } });
    const unposted = await newPublic(a, { posted: false, stat: { viewCount: 20_000_000 } });
    const deleted = await newPublic(a, { stat: { viewCount: 20_000_000 } });
    const hidden = await newPublic(a, { stat: { viewCount: 20_000_000 } });
    await prisma.project.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    await prisma.project.update({ where: { id: hidden.id }, data: { hiddenAt: new Date() } });

    const body = await home(viewer);
    const ids = body.recommended.map((p) => p.id);
    expect(ids.length).toBeLessThanOrEqual(12);
    for (const excluded of [unposted.id, deleted.id, hidden.id]) {
      expect(ids).not.toContain(excluded);
    }
    expect(ids.indexOf(top.id)).toBeLessThan(ids.indexOf(tieNew.id));
    expect(ids.indexOf(tieNew.id)).toBeLessThan(ids.indexOf(tieOld.id));
    const card = body.recommended.find((p) => p.id === top.id)!;
    expect(card.coverThumbUrl).toBe(`/assets/answers/${top.answerId}/thumb`);
    expect(card.author.id).toBe(a.creatorId);

    const rising = body.risingCreators.map((c) => c.id);
    expect(rising.indexOf(a.creatorId)).toBeGreaterThanOrEqual(0);
    expect(rising.indexOf(a.creatorId)).toBeLessThan(
      rising.includes(b.creatorId) ? rising.indexOf(b.creatorId) : Infinity,
    );
  });

  it('lists hot topics (empty ones omitted) and topic detail, 404 for unknown topic', async () => {
    const who = await newWho();
    const full = await newTopic('Full topic');
    const empty = await newTopic('Empty topic');
    const low = await newPublic(who, { topicId: full.id, stat: { viewCount: 1 } });
    const high = await newPublic(who, { topicId: full.id, stat: { viewCount: 9 } });
    await prisma.agoraComment.create({
      data: { projectId: high.id, authorId: who.creatorId, body: 'visible' },
    });
    await prisma.agoraComment.create({
      data: { projectId: high.id, authorId: who.creatorId, body: 'gone', deletedAt: new Date() },
    });
    await prisma.agoraComment.create({
      data: { projectId: high.id, authorId: who.creatorId, body: 'hid', hiddenAt: new Date() },
    });
    await prisma.projectStat.update({ where: { projectId: high.id }, data: { likeCount: 7 } });

    const detail = TopicResponseSchema.parse(
      await (await call('GET', `/agora/topics/${full.id}`, who.token)).json(),
    );
    expect(detail.topic.title).toBe('Full topic');
    expect(detail.projects.map((p) => p.id)).toEqual([high.id, low.id]);
    expect(detail.projects[0]).toMatchObject({ likeCount: 7, commentCount: 1 });

    const emptyDetail = TopicResponseSchema.parse(
      await (await call('GET', `/agora/topics/${empty.id}`, who.token)).json(),
    );
    expect(emptyDetail.projects).toEqual([]);

    const topics = (await home(who)).hotTopics.map((t) => t.topic.id);
    expect(topics).toContain(full.id);
    expect(topics).not.toContain(empty.id);

    const missing = await call('GET', `/agora/topics/${randomUUID()}`, who.token);
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe('NOT_FOUND');
  });

  it('returns project detail with derivatives and a Deleted original marker', async () => {
    const owner = await newWho();
    const other = await newWho();
    const original = await newPublic(owner, { title: 'Original' });
    const child = await newPublic(other, { title: 'Child', derivedFromProjectId: original.id });
    await prisma.project.update({
      where: { id: child.id },
      data: { derivedFromAnswerId: original.answerId },
    });

    const res = await call('GET', `/agora/projects/${original.id}`, other.token);
    expect(res.status).toBe(200);
    const body = AgoraProjectResponseSchema.parse(await res.json());
    expect(body.reason).toBe('Calm light');
    expect(body.coverImageUrl).toBe(`/assets/answers/${original.answerId}/full`);
    expect(body.sets).toHaveLength(1);
    expect(body.sets[0]!.answers.map((a) => a.id)).toEqual([original.answerId]);
    expect(body.derivatives.map((d) => d.id)).toEqual([child.id]);
    expect(body.derivedFrom).toBeUndefined();

    const childBody = AgoraProjectResponseSchema.parse(
      await (await call('GET', `/agora/projects/${child.id}`, owner.token)).json(),
    );
    expect(childBody.derivedFrom).toEqual({
      projectId: original.id,
      answerId: original.answerId,
      title: 'Original',
    });

    await prisma.project.update({ where: { id: original.id }, data: { deletedAt: new Date() } });
    const after = AgoraProjectResponseSchema.parse(
      await (await call('GET', `/agora/projects/${child.id}`, owner.token)).json(),
    );
    expect(after.derivedFrom).toEqual({ projectId: original.id, answerId: null, title: null });
    expect((await call('GET', `/agora/projects/${original.id}`, owner.token)).status).toBe(404);
  });

  it('hides unposted, hidden and unknown projects with 404', async () => {
    const owner = await newWho();
    const unposted = await newPublic(owner, { posted: false });
    expect((await call('GET', `/agora/projects/${unposted.id}`, owner.token)).status).toBe(404);
    expect((await call('GET', `/agora/projects/${randomUUID()}`, owner.token)).status).toBe(404);
    expect((await call('POST', `/agora/projects/${unposted.id}/views`, owner.token)).status).toBe(
      404,
    );
  });

  it('counts a view once per session, project and UTC day (also concurrent)', async () => {
    const owner = await newWho();
    const s1 = await newWho();
    const s2 = await newWho();
    const p = await newPublic(owner);
    const views = async () =>
      (await prisma.projectStat.findUnique({ where: { projectId: p.id } }))?.viewCount ?? 0;

    expect((await call('POST', `/agora/projects/${p.id}/views`, s1.token)).status).toBe(204);
    expect((await call('POST', `/agora/projects/${p.id}/views`, s1.token)).status).toBe(204);
    expect(await views()).toBe(1);
    expect((await call('POST', `/agora/projects/${p.id}/views`, s2.token)).status).toBe(204);
    expect(await views()).toBe(2);
    // 내 프로젝트를 봐도 센다.
    expect((await call('POST', `/agora/projects/${p.id}/views`, owner.token)).status).toBe(204);
    expect(await views()).toBe(3);

    const fresh = await newWho();
    const results = await Promise.all([
      call('POST', `/agora/projects/${p.id}/views`, fresh.token),
      call('POST', `/agora/projects/${p.id}/views`, fresh.token),
    ]);
    expect(results.map((r) => r.status)).toEqual([204, 204]);
    expect(await views()).toBe(4);
    expect(
      await prisma.event.count({
        where: { projectId: p.id, type: 'project_view', source: 'server' },
      }),
    ).toBe(4);
  });

  it('derives a copy: one set + one answer, new image key, stats and idempotency', async () => {
    const owner = await newWho();
    const me = await newWho();
    const src = await newPublic(owner, { title: 'Source' });
    // 복사되면 안 되는 것들: 코멘트·다른 확정 버전
    await prisma.nodeComment.create({
      data: { answerId: src.answerId, nodeId: 'k1', authorId: owner.creatorId, body: 'c' },
    });
    await prisma.answer.create({
      data: {
        setId: src.setId,
        status: 'accepted',
        number: 2,
        origin: 'generated',
        imageKey: 'k',
        imageMode: 'generate',
        assembledPrompt: 'b',
        phrases: {},
        excluded: [],
        nodes: snapshot,
        provider: 'mock',
        model: 'mock',
        createdById: owner.creatorId,
        createdAt: new Date(Date.now() - 500),
      },
    });
    const existing = await newPublic(me, { title: 'Mine' });
    expect(existing.id).toBeTruthy();

    const key = randomUUID();
    const res = await call('POST', `/agora/projects/${src.id}/derive`, me.token, undefined, key);
    expect(res.status).toBe(201);
    const { project } = DeriveProjectResponseSchema.parse(await res.json());
    expect(project).toMatchObject({ title: 'Source', kind: 'derive', status: 'building' });
    expect(project.shelfPosition).toBe(0);
    projectIds.push(project.id);

    // 같은 키 연타 → 같은 프로젝트 하나
    const again = await call('POST', `/agora/projects/${src.id}/derive`, me.token, undefined, key);
    expect(DeriveProjectResponseSchema.parse(await again.json()).project.id).toBe(project.id);
    expect(await prisma.project.count({ where: { ownerId: me.creatorId, kind: 'derive' } })).toBe(
      1,
    );

    const row = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      include: { sets: { include: { answers: true } }, pages: true },
    });
    expect(row.ownerId).toBe(me.creatorId);
    expect(row.derivedFromProjectId).toBe(src.id);
    expect(row.derivedFromAnswerId).toBe(src.answerId);
    expect(row.pages).toHaveLength(1);
    expect(row.sets).toHaveLength(1);
    expect(row.sets[0]!.answers).toHaveLength(1);
    const copy = row.sets[0]!.answers[0]!;
    expect(copy.origin).toBe('derived_copy');
    expect(copy.imageKey).not.toBe(`answers/${src.answerId}/full.png`);
    expect(copy.copiedFromAnswerId).toBe(src.answerId);
    expect(Array.from(await storage.get(copy.imageKey))).toEqual([1, 2, 3, 4]);
    expect(await prisma.nodeComment.count({ where: { answerId: copy.id } })).toBe(0);
    // 서가 맨 앞: 기존 프로젝트는 한 칸 밀린다.
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: existing.id } })).shelfPosition,
    ).toBe(1);
    expect(
      (await prisma.projectStat.findUniqueOrThrow({ where: { projectId: src.id } })).deriveCount,
    ).toBe(1);
    expect(
      await prisma.event.count({ where: { type: 'derive_start', creatorId: me.creatorId } }),
    ).toBe(1);

    // 키 없음 거부
    const noKey = await call('POST', `/agora/projects/${src.id}/derive`, me.token);
    expect(noKey.status).toBe(400);
    expect(await errorCode(noKey)).toBe('IDEMPOTENCY_KEY_MISSING');
  });

  it('rejects derive from an unavailable source', async () => {
    const owner = await newWho();
    const me = await newWho();
    const deleted = await newPublic(owner);
    const unposted = await newPublic(owner, { posted: false });
    await prisma.project.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    for (const id of [deleted.id, unposted.id]) {
      const res = await call(
        'POST',
        `/agora/projects/${id}/derive`,
        me.token,
        undefined,
        randomUUID(),
      );
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe('DERIVE_SOURCE_UNAVAILABLE');
    }
    const missing = await call(
      'POST',
      `/agora/projects/${randomUUID()}/derive`,
      me.token,
      undefined,
      randomUUID(),
    );
    expect(await errorCode(missing)).toBe('NOT_FOUND');
    expect(await prisma.project.count({ where: { ownerId: me.creatorId } })).toBe(0);
  });

  it('writes, pages and deletes comments (own only), enforcing length and idempotency', async () => {
    const owner = await newWho();
    const other = await newWho();
    const p = await newPublic(owner);
    const post = (who: Who, body: unknown, key: string | null = randomUUID()) =>
      call('POST', `/projects/${p.id}/comments`, who.token, body, key ?? undefined);

    const first = await post(other, { body: '  hello  ' });
    expect(first.status).toBe(201);
    const created = CreateAgoraCommentResponseSchema.parse(await first.json()).comment;
    expect(created).toMatchObject({ body: 'hello', mine: true });

    const key = randomUUID();
    const r1 = await post(owner, { body: 'dup' }, key);
    const r2 = await post(owner, { body: 'dup' }, key);
    expect(((await r1.json()) as { comment: { id: string } }).comment.id).toBe(
      ((await r2.json()) as { comment: { id: string } }).comment.id,
    );
    for (let i = 0; i < 3; i += 1) {
      expect((await post(owner, { body: `c${i}` })).status).toBe(201);
    }
    expect(await prisma.event.count({ where: { projectId: p.id, type: 'comment_add' } })).toBe(5);

    // 목록: 최신순, 페이지(before), mine
    const page1 = CommentListResponseSchema.parse(
      await (await call('GET', `/projects/${p.id}/comments?limit=2`, other.token)).json(),
    ).comments;
    expect(page1.map((c) => c.body)).toEqual(['c2', 'c1']);
    const page2 = CommentListResponseSchema.parse(
      await (
        await call('GET', `/projects/${p.id}/comments?limit=50&before=${page1[1]!.id}`, other.token)
      ).json(),
    ).comments;
    expect(page2.map((c) => c.body)).toEqual(['c0', 'dup', 'hello']);
    expect(page2.map((c) => c.mine)).toEqual([false, false, true]);
    expect((await call('GET', `/projects/${p.id}/comments?limit=51`, other.token)).status).toBe(
      400,
    );

    // 삭제: 남의 것 403, 내 것 204, 다시 404, 목록에서 빠짐
    const del = await call('DELETE', `/comments/${created.id}`, owner.token);
    expect(del.status).toBe(403);
    expect(await errorCode(del)).toBe('FORBIDDEN');
    expect((await call('DELETE', `/comments/${created.id}`, other.token)).status).toBe(204);
    expect((await call('DELETE', `/comments/${created.id}`, other.token)).status).toBe(404);
    const after = CommentListResponseSchema.parse(
      await (await call('GET', `/projects/${p.id}/comments`, other.token)).json(),
    ).comments;
    expect(after.map((c) => c.id)).not.toContain(created.id);

    // 글자 수 경계, 키 없음, 공개 아닌 프로젝트
    expect((await post(other, { body: '' })).status).toBe(400);
    expect((await post(other, { body: '   ' })).status).toBe(400);
    expect((await post(other, { body: 'x'.repeat(LIMITS.COMMENT_MAX) })).status).toBe(201);
    expect((await post(other, { body: 'x'.repeat(LIMITS.COMMENT_MAX + 1) })).status).toBe(400);
    const noKey = await post(other, { body: 'ok' }, null);
    expect(noKey.status).toBe(400);
    expect(await errorCode(noKey)).toBe('IDEMPOTENCY_KEY_MISSING');
    await prisma.project.update({ where: { id: p.id }, data: { postedAt: null } });
    expect((await post(other, { body: 'late' })).status).toBe(404);
    expect((await call('GET', `/projects/${p.id}/comments`, other.token)).status).toBe(404);
  });
});
