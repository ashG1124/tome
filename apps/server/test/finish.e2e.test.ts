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
  FinishCandidatesResponseSchema,
  FinishProjectResponseSchema,
  type JobStage,
  LIMITS,
  PostProjectResponseSchema,
  ProjectListResponseSchema,
} from '@tome/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client';
import { LoginRateLimiter } from '../src/modules/session/login-rate-limiter';
import { PrismaService } from '../src/prisma/prisma.service';
import { SEED_CREATORS } from '../prisma/seed/creators';

// 실제 Postgres(마이그레이션 적용 완료)가 있을 때만 돈다. TEST_DATABASE_URL 이 없으면 건너뛴다.
const url = process.env.TEST_DATABASE_URL;

const ADMIN_TOKEN = 'e2e-admin-token-for-tests';
const STAGES: JobStage[] = [
  'analyze',
  'research',
  'evidence',
  'draft',
  'assemble',
  'image',
  'verify',
];

interface Owner {
  creatorId: string;
  token: string;
  sessionId: string;
}

describe.skipIf(!url)('finish & post API (real Postgres)', () => {
  // 앱 기동과 답변 생성(7단계)이 여러 번 있어 기본 제한(5~10초)보다 오래 걸릴 수 있다.
  vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

  let app: INestApplication;
  let base: string;
  let prisma: PrismaClient;
  let storageDir: string;
  const runId = randomUUID();
  const prefix = `e2e-finish-${runId}`;
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
  const errorOf = async (res: Response) => ApiErrorSchema.parse(await res.json()).error;
  const errorCode = async (res: Response) => (await errorOf(res)).code;

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
    const consent = await call('POST', '/session/consent', session.token, {
      noticeVersion: session.noticeVersion,
    });
    expect(consent.status).toBe(200);
    const row = await prisma.demoSession.findFirstOrThrow({
      where: { creatorId: creator.id },
      select: { id: true },
    });
    return { creatorId: creator.id, token: session.token, sessionId: row.id };
  };

  const runAll = async (owner: Owner, jobId: string) => {
    for (const stage of STAGES) {
      const res = await call('POST', `/jobs/${jobId}/advance`, owner.token, { stage });
      expect(res.status).toBe(200);
    }
  };
  /** 프롬프트로 프로젝트를 만들고 끝까지 진행해 확정 답변 1개를 갖춘다. */
  const generated = async (owner: Owner) => {
    const res = await call(
      'POST',
      '/projects',
      owner.token,
      { prompt: 'a lighthouse' },
      randomUUID(),
    );
    expect(res.status).toBe(201);
    const created = CreateProjectResponseSchema.parse(await res.json());
    await runAll(owner, created.job!.id);
    const answers = await prisma.answer.findMany({
      where: { set: { projectId: created.project.id } },
      orderBy: { createdAt: 'asc' },
    });
    expect(answers.map((a) => a.status)).toEqual(['accepted']);
    return { projectId: created.project.id, answerId: answers[0]!.id };
  };
  /** 같은 프로젝트에 세트를 하나 더 만들어 끝까지 돌린다(새 확정 답변). */
  const generateMore = async (owner: Owner, projectId: string) => {
    const page = await prisma.page.findFirstOrThrow({ where: { projectId } });
    const res = await call(
      'POST',
      `/projects/${projectId}/sets`,
      owner.token,
      { pageId: page.id, prompt: 'a harbor' },
      randomUUID(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { job: { id: string } };
    await runAll(owner, body.job.id);
    return prisma.answer.findMany({
      where: { set: { projectId } },
      orderBy: { createdAt: 'asc' },
    });
  };
  const emptyProject = async (owner: Owner) => {
    const res = await call('POST', '/projects', owner.token, {}, randomUUID());
    expect(res.status).toBe(201);
    return CreateProjectResponseSchema.parse(await res.json()).project.id;
  };

  const finish = (owner: Owner, projectId: string, body: unknown, key: string = randomUUID()) =>
    call('POST', `/projects/${projectId}/finish`, owner.token, body, key);
  const finishBody = (answerId: string, extra: Record<string, unknown> = {}) => ({
    title: 'My lighthouse',
    coverAnswerId: answerId,
    ...extra,
  });
  const post = (owner: Owner, projectId: string, posted: boolean) =>
    call('PUT', `/projects/${projectId}/post`, owner.token, { posted });
  const readAnswer = (owner: Owner, answerId: string) =>
    call('GET', `/answers/${answerId}`, owner.token);
  const eventCount = (projectId: string, type: string) =>
    prisma.event.count({ where: { projectId, type: type as never, source: 'server' } });
  const shelf = async (owner: Owner) => {
    const res = await call('GET', '/projects', owner.token);
    expect(res.status).toBe(200);
    return ProjectListResponseSchema.parse(await res.json()).projects;
  };

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'tome-e2e-finish-'));
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
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
  });

  it('finishes, posts and shows the shelf entry; others read the cover only after posting', async () => {
    const alice = await newOwner();
    const bob = await newOwner();
    const { projectId, answerId } = await generated(alice);

    const candidates = await call('GET', `/projects/${projectId}/finish-candidates`, alice.token);
    expect(candidates.status).toBe(200);
    expect(
      FinishCandidatesResponseSchema.parse(await candidates.json()).answers.map((a) => a.id),
    ).toEqual([answerId]);

    const done = await finish(alice, projectId, finishBody(answerId, { reason: 'Calm light' }));
    expect(done.status).toBe(200);
    const { project } = FinishProjectResponseSchema.parse(await done.json());
    expect(project).toMatchObject({
      id: projectId,
      title: 'My lighthouse',
      status: 'finished',
      posted: false,
      coverThumbUrl: `/assets/answers/${answerId}/thumb`,
    });
    const row = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(row.selectionReason).toBe('Calm light');
    expect(row.finishedAt).not.toBeNull();
    expect(await eventCount(projectId, 'project_finish')).toBe(1);

    // 게시 전에는 남이 못 읽는다.
    expect((await readAnswer(bob, answerId)).status).toBe(404);

    const posted = await post(alice, projectId, true);
    expect(posted.status).toBe(200);
    const { postedAt } = PostProjectResponseSchema.parse(await posted.json());
    expect(postedAt).not.toBeNull();

    const mine = (await shelf(alice)).find((p) => p.id === projectId)!;
    expect(mine).toMatchObject({
      status: 'finished',
      posted: true,
      coverThumbUrl: `/assets/answers/${answerId}/thumb`,
    });
    expect((await readAnswer(bob, answerId)).status).toBe(200);
    const asset = await fetch(`${base}/assets/answers/${answerId}/full`, {
      redirect: 'manual',
      headers: { authorization: `Bearer ${bob.token}` },
    });
    expect(asset.status).toBe(302);

    // 게시 취소 → 다시 안 보임, postedAt 비움
    const unposted = await post(alice, projectId, false);
    expect(PostProjectResponseSchema.parse(await unposted.json()).postedAt).toBeNull();
    expect((await readAnswer(bob, answerId)).status).toBe(404);
    expect(await eventCount(projectId, 'project_post')).toBe(2);
  });

  it('lists candidates: pinned ones only, or every accepted answer when none are pinned', async () => {
    const owner = await newOwner();
    const { projectId, answerId } = await generated(owner);
    const all = await generateMore(owner, projectId);
    const second = all.find((a) => a.id !== answerId)!;
    const ids = async () => {
      const res = await call('GET', `/projects/${projectId}/finish-candidates`, owner.token);
      expect(res.status).toBe(200);
      return FinishCandidatesResponseSchema.parse(await res.json()).answers.map((a) => a.id);
    };
    expect(await ids()).toEqual([answerId, second.id]);
    await prisma.answer.update({ where: { id: second.id }, data: { pinned: true } });
    expect(await ids()).toEqual([second.id]);
    // 핀한 답변이 draft 면 후보가 아니다 → 확정 답변 전부로 돌아간다
    await prisma.answer.update({ where: { id: second.id }, data: { status: 'draft' } });
    expect(await ids()).toEqual([answerId]);
    await prisma.answer.update({ where: { id: second.id }, data: { status: 'discarded' } });
    expect(await ids()).toEqual([answerId]);

    const stranger = await newOwner();
    expect(
      (await call('GET', `/projects/${projectId}/finish-candidates`, stranger.token)).status,
    ).toBe(403);
    expect(
      (await call('GET', `/projects/${randomUUID()}/finish-candidates`, owner.token)).status,
    ).toBe(404);
  });

  it('rejects posting before finishing, but allows un-posting an unfinished project', async () => {
    const owner = await newOwner();
    const { projectId } = await generated(owner);
    const res = await post(owner, projectId, true);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('NOT_FINISHED');
    expect(await eventCount(projectId, 'project_post')).toBe(0);
    const off = await post(owner, projectId, false);
    expect(off.status).toBe(200);
    expect(PostProjectResponseSchema.parse(await off.json()).postedAt).toBeNull();
  });

  it('rejects finishing without answers, with blank/long titles, and with a foreign cover', async () => {
    const owner = await newOwner();
    const empty = await emptyProject(owner);
    const { projectId, answerId } = await generated(owner);
    const other = await newOwner();
    const theirs = await generated(other);

    const none = await finish(owner, empty, finishBody(answerId));
    expect(none.status).toBe(409);
    expect(await errorCode(none)).toBe('NOT_FINISHABLE');

    for (const title of ['', '   ']) {
      const res = await finish(owner, projectId, finishBody(answerId, { title }));
      expect(res.status).toBe(400);
      const error = await errorOf(res);
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(error.details)).toContain('title');
    }
    const tooLong = await finish(
      owner,
      projectId,
      finishBody(answerId, { title: 'x'.repeat(LIMITS.TITLE_MAX + 1) }),
    );
    expect(tooLong.status).toBe(400);
    const longReason = await finish(
      owner,
      projectId,
      finishBody(answerId, { reason: 'x'.repeat(LIMITS.REASON_MAX + 1) }),
    );
    expect(longReason.status).toBe(400);
    // 경계값은 통과
    const edge = await finish(
      owner,
      projectId,
      finishBody(answerId, {
        title: 'x'.repeat(LIMITS.TITLE_MAX),
        reason: 'y'.repeat(LIMITS.REASON_MAX),
      }),
    );
    expect(edge.status).toBe(200);

    // 남의 답변·없는 답변·draft 답변은 대표가 될 수 없다
    for (const cover of [theirs.answerId, randomUUID()]) {
      const res = await finish(owner, projectId, finishBody(cover));
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe('VALIDATION_FAILED');
    }
    await prisma.answer.update({ where: { id: answerId }, data: { status: 'draft' } });
    expect((await finish(owner, projectId, finishBody(answerId))).status).toBe(409);
    await prisma.answer.update({ where: { id: answerId }, data: { status: 'accepted' } });
    expect((await finish(owner, empty, finishBody(theirs.answerId))).status).toBe(409);

    // 실패한 요청은 상태를 바꾸지 않는다
    expect((await prisma.project.findUniqueOrThrow({ where: { id: empty } })).status).toBe(
      'building',
    );
    expect(await eventCount(empty, 'project_finish')).toBe(0);
  });

  it('forbids others and 404s for missing, deleted or hidden projects', async () => {
    const owner = await newOwner();
    const stranger = await newOwner();
    const { projectId, answerId } = await generated(owner);
    expect((await finish(stranger, projectId, finishBody(answerId))).status).toBe(403);
    expect((await post(stranger, projectId, true)).status).toBe(403);
    expect((await finish(owner, randomUUID(), finishBody(answerId))).status).toBe(404);
    expect((await post(owner, randomUUID(), true)).status).toBe(404);

    const hidden = await generated(owner);
    await prisma.project.update({
      where: { id: hidden.projectId },
      data: { hiddenAt: new Date() },
    });
    expect((await finish(owner, hidden.projectId, finishBody(hidden.answerId))).status).toBe(404);
    expect((await post(owner, hidden.projectId, false)).status).toBe(404);
  });

  it('finish is idempotent: same key replays, concurrent calls record one event, other body conflicts', async () => {
    const owner = await newOwner();
    const { projectId, answerId } = await generated(owner);
    const key = randomUUID();
    const first = await finish(owner, projectId, finishBody(answerId), key);
    const second = await finish(owner, projectId, finishBody(answerId), key);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(await eventCount(projectId, 'project_finish')).toBe(1);
    const finishedAt = (await prisma.project.findUniqueOrThrow({ where: { id: projectId } }))
      .finishedAt;

    const conflict = await finish(owner, projectId, finishBody(answerId, { title: 'Other' }), key);
    expect(conflict.status).toBe(409);
    expect(await errorCode(conflict)).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).finishedAt,
    ).toEqual(finishedAt);

    const concurrent = await generated(owner);
    const ckey = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        finish(owner, concurrent.projectId, finishBody(concurrent.answerId), ckey),
      ),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);
    expect(await eventCount(concurrent.projectId, 'project_finish')).toBe(1);
  });

  it('finishing again updates cover, title, reason and the finish time', async () => {
    const owner = await newOwner();
    const { projectId, answerId } = await generated(owner);
    const all = await generateMore(owner, projectId);
    const second = all.find((a) => a.id !== answerId)!;
    await finish(owner, projectId, finishBody(answerId, { reason: 'first' }));
    const before = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const res = await finish(
      owner,
      projectId,
      finishBody(second.id, { title: 'Second take', reason: 'better' }),
    );
    expect(res.status).toBe(200);
    const after = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(after).toMatchObject({
      title: 'Second take',
      coverAnswerId: second.id,
      selectionReason: 'better',
      status: 'finished',
    });
    expect(after.finishedAt!.getTime()).toBeGreaterThan(before.finishedAt!.getTime());
    // 이유를 생략하면 비운다
    await finish(owner, projectId, finishBody(second.id));
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).selectionReason,
    ).toBeNull();
  });

  it('post is naturally idempotent: postedAt stays fixed and one event is recorded', async () => {
    const owner = await newOwner();
    const { projectId, answerId } = await generated(owner);
    await finish(owner, projectId, finishBody(answerId));
    const results = await Promise.all(
      Array.from({ length: 5 }, () => post(owner, projectId, true)),
    );
    const times = await Promise.all(
      results.map(async (r) => {
        expect(r.status).toBe(200);
        return PostProjectResponseSchema.parse(await r.json()).postedAt;
      }),
    );
    expect(new Set(times).size).toBe(1);
    expect(await eventCount(projectId, 'project_post')).toBe(1);
    const again = await post(owner, projectId, true);
    expect(PostProjectResponseSchema.parse(await again.json()).postedAt).toBe(times[0]);
    expect(await eventCount(projectId, 'project_post')).toBe(1);

    const off = await Promise.all([post(owner, projectId, false), post(owner, projectId, false)]);
    expect(off.map((r) => r.status)).toEqual([200, 200]);
    expect(await eventCount(projectId, 'project_post')).toBe(2);
    const event = await prisma.event.findFirstOrThrow({
      where: { projectId, type: 'project_post' },
      orderBy: { serverTs: 'desc' },
    });
    expect(event.payload).toEqual({ posted: false });
  });

  it('keeps the posted snapshot: answers made after finishing are owner-only until finishing again', async () => {
    const owner = await newOwner();
    const viewer = await newOwner();
    const { projectId, answerId } = await generated(owner);
    await finish(owner, projectId, finishBody(answerId));
    await post(owner, projectId, true);

    const all = await generateMore(owner, projectId);
    const later = all.find((a) => a.id !== answerId)!;
    expect(later.status).toBe('accepted');
    expect((await readAnswer(owner, later.id)).status).toBe(200);
    expect((await readAnswer(viewer, later.id)).status).toBe(404);
    expect((await readAnswer(viewer, answerId)).status).toBe(200);
    const asset = await fetch(`${base}/assets/answers/${later.id}/thumb`, {
      redirect: 'manual',
      headers: { authorization: `Bearer ${viewer.token}` },
    });
    expect(asset.status).toBe(404);

    // 다시 완료하면 그 시점으로 갱신된다
    await finish(owner, projectId, finishBody(later.id));
    expect((await readAnswer(viewer, later.id)).status).toBe(200);
    // 게시 중에도 대표가 바뀐 서가 응답이 맞다
    const mine = (await shelf(owner)).find((p) => p.id === projectId)!;
    expect(mine).toMatchObject({
      posted: true,
      status: 'finished',
      coverThumbUrl: `/assets/answers/${later.id}/thumb`,
    });
  });

  it('keeps finished and posted projects renamable and deletable; then finish/post 404', async () => {
    const owner = await newOwner();
    const viewer = await newOwner();
    const { projectId, answerId } = await generated(owner);
    await finish(owner, projectId, finishBody(answerId));
    await post(owner, projectId, true);

    const rename = await call('PATCH', `/projects/${projectId}`, owner.token, { title: 'Renamed' });
    expect(rename.status).toBe(200);
    expect(await shelf(owner)).toEqual([
      expect.objectContaining({
        id: projectId,
        title: 'Renamed',
        status: 'finished',
        posted: true,
      }),
    ]);

    expect((await call('DELETE', `/projects/${projectId}`, owner.token)).status).toBe(204);
    expect((await shelf(owner)).map((p) => p.id)).not.toContain(projectId);
    expect((await finish(owner, projectId, finishBody(answerId))).status).toBe(404);
    expect((await post(owner, projectId, true)).status).toBe(404);
    expect((await post(owner, projectId, false)).status).toBe(404);
    expect(
      (await call('GET', `/projects/${projectId}/finish-candidates`, owner.token)).status,
    ).toBe(404);
    expect((await readAnswer(viewer, answerId)).status).toBe(404);
  });
});
