import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import sharp from 'sharp';
import {
  AdminResetResponseSchema,
  AdvanceJobResponseSchema,
  AgoraHomeResponseSchema,
  AgoraProjectResponseSchema,
  CompareResponseSchema,
  ConnectionListResponseSchema,
  CreateProjectResponseSchema,
  CreateSessionResponseSchema,
  CreatorProfileResponseSchema,
  MeResponseSchema,
  NodeCommentListResponseSchema,
  IdentityResponseSchema,
  ProjectListResponseSchema,
  RemixCandidatesResponseSchema,
  type JobStage,
} from '@tome/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client';
import { LoginRateLimiter } from '../src/modules/session/login-rate-limiter';
import { registerShowcaseAccessCode } from '../src/seed/access-code';
import { SHOWCASE_CREATOR_ID, seedCreatorIds } from '../src/seed/creators';
import { uploadSeedImages } from '../src/seed/images';
import { loadSeedContent, upsertSeedCreators, upsertSeedTopics } from '../src/seed/load';
import { buildSeedPlan } from '../src/seed/plan';
import { OBJECT_STORAGE, type ObjectStorage } from '../src/storage';

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

// 시드가 커서(창작자 9명·프로젝트 50개) 적재·리셋 한 번이 수 초 걸린다. 테스트마다 1분까지 기다린다(리셋 1분 목표는 마지막 테스트가 본다).
describe.skipIf(!url)(
  'seed content and POST /admin/reset (real Postgres)',
  { timeout: 60_000 },
  () => {
    let app: INestApplication;
    let base: string;
    let prisma: PrismaClient;
    let storage: ObjectStorage;
    let storageDir: string;
    let assetsDir: string;
    const plan = buildSeedPlan();
    const seedIds = seedCreatorIds('seed');
    const personaIds = seedCreatorIds('persona');
    const visitorIds = seedCreatorIds('visitor');
    const prefix = `e2e-seed-${randomUUID()}`;
    const extraCreatorIds: string[] = [];
    const timings: Record<string, number> = {};

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
    const reset = (scope: string, token: string | null = ADMIN_TOKEN) =>
      fetch(`${base}/admin/reset`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'x-admin-token': token } : {}),
        },
        body: JSON.stringify({ scope }),
      });
    const runReset = async (scope: string) => {
      const t0 = Date.now();
      const res = await reset(scope);
      const wall = Date.now() - t0;
      expect(res.status).toBe(200);
      const body = AdminResetResponseSchema.parse(await res.json());
      timings[scope] = wall;
      return body;
    };

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
      expect(login.status).toBe(200);
      const session = CreateSessionResponseSchema.parse(await login.json());
      await prisma.accessCode.updateMany({ where: { creatorId }, data: { active: false } });
      const consent = await call('POST', '/session/consent', session.token, {
        noticeVersion: session.noticeVersion,
      });
      expect(consent.status).toBe(200);
      return session.token;
    };
    const newFreshCreator = async () => {
      const creator = await prisma.creator.create({
        data: { kind: 'persona', displayName: 'E2E seed viewer', identityPublic: false },
      });
      extraCreatorIds.push(creator.id);
      return { creatorId: creator.id, token: await loginAs(creator.id) };
    };

    const createFixtureProject = async (token: string) => {
      const res = await call('POST', '/projects', token, { prompt: 'a lighthouse' }, randomUUID());
      expect(res.status).toBe(201);
      const created = CreateProjectResponseSchema.parse(await res.json());
      let answerId = '';
      for (const stage of STAGES) {
        const step = await call('POST', `/jobs/${created.job!.id}/advance`, token, { stage });
        expect(step.status).toBe(200);
        const parsed = AdvanceJobResponseSchema.parse(await step.json());
        if (stage === 'image') answerId = parsed.step.answer!.id;
      }
      return { projectId: created.project.id, answerId };
    };

    const counts = async (creatorIds: string[]) => ({
      projects: await prisma.project.count({ where: { ownerId: { in: creatorIds } } }),
      sets: await prisma.promptSet.count({ where: { project: { ownerId: { in: creatorIds } } } }),
      answers: await prisma.answer.count({
        where: { set: { project: { ownerId: { in: creatorIds } } } },
      }),
      events: await prisma.event.count({ where: { creatorId: { in: creatorIds } } }),
      stats: await prisma.projectStat.count({
        where: { project: { ownerId: { in: creatorIds } } },
      }),
    });
    const contentHash = async (creatorIds: string[]) => {
      const answers = await prisma.answer.findMany({
        where: { set: { project: { ownerId: { in: creatorIds } } } },
        orderBy: { id: 'asc' },
        select: { id: true, nodes: true, assembledPrompt: true, status: true, number: true },
      });
      const events = await prisma.event.findMany({
        where: { creatorId: { in: creatorIds } },
        orderBy: { id: 'asc' },
        select: { id: true, type: true, payload: true, serverTs: true },
      });
      return JSON.stringify({ answers, events });
    };
    const load = (ids: string[]) =>
      prisma.$transaction((tx) => loadSeedContent(tx, ids), { timeout: 120_000 });

    const expectedSeed = {
      projects: plan.projects.filter((p) => p.ownerKind === 'seed').length,
      sets: plan.sets.filter((s) =>
        plan.projects.some((p) => p.id === s.projectId && p.ownerKind === 'seed'),
      ).length,
    };
    const seedProjectIds = new Set(
      plan.projects.filter((p) => p.ownerKind === 'seed').map((p) => p.id),
    );
    /** 계획상 seed 프로젝트에 달린 시드 댓글 수(쇼케이스 계정이 남긴 것 포함). */
    const commentsOnSeed = plan.comments.filter((c) => seedProjectIds.has(c.projectId)).length;
    const personaProjectCount = plan.projects.filter((p) => p.ownerKind === 'persona').length;
    const showcaseProjects = plan.projects.filter((p) => p.ownerId === SHOWCASE_CREATOR_ID);
    const showcaseFavorites = plan.favorites.filter((f) => f.creatorId === SHOWCASE_CREATOR_ID);
    const seedNodeCommentIds = plan.nodeComments.map((c) => c.id);
    /** 살아 있는(지우지 않은) 시드 노드 코멘트 수 */
    const liveSeedNodeComments = (where: Record<string, unknown> = {}) =>
      prisma.nodeComment.count({
        where: { id: { in: seedNodeCommentIds }, deletedAt: null, ...where },
      });

    beforeAll(async () => {
      storageDir = await mkdtemp(join(tmpdir(), 'tome-e2e-seed-'));
      // 시안 이미지 폴더 대신 쓰는 임시 폴더: 프로필 이미지 둘(Lind·Julian)만 둔다.
      assetsDir = await mkdtemp(join(tmpdir(), 'tome-e2e-seed-assets-'));
      await mkdir(join(assetsDir, 'avatars'));
      const avatar = await sharp({
        create: { width: 32, height: 32, channels: 3, background: { r: 30, g: 90, b: 200 } },
      })
        .jpeg()
        .toBuffer();
      await writeFile(join(assetsDir, 'avatars', 'lind.jpg'), avatar);
      await writeFile(join(assetsDir, 'avatars', 'julian.jpg'), avatar);
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
      storage = app.get<ObjectStorage>(OBJECT_STORAGE, { strict: false });
      app.get(LoginRateLimiter, { strict: false }).clear();
      prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
      // 시드 적재(db:seed 와 같은 함수). 이미지는 임시 저장소에 올린다.
      const images = await uploadSeedImages(storage, { assetsDir });
      await prisma.$transaction(
        async (tx) => {
          await upsertSeedCreators(tx, images.avatars);
          await upsertSeedTopics(tx);
          await loadSeedContent(tx, [...seedIds, ...personaIds]);
        },
        { timeout: 120_000 },
      );
      // 이전 실행이 남긴 비시드 흔적을 비워 같은 출발선에서 시작한다.
      await reset('all-nonseed');
    }, 180_000);

    afterAll(async () => {
      if (prisma) {
        const owners = [...seedIds, ...personaIds];
        await prisma.project.deleteMany({ where: { ownerId: { in: owners } } });
        await prisma.event.deleteMany({ where: { creatorId: { in: owners } } });
        await prisma.identitySnapshot.deleteMany({ where: { creatorId: { in: owners } } });
        await prisma.topic.deleteMany({ where: { id: { in: plan.topics.map((t) => t.id) } } });
        const everyone = [...extraCreatorIds, ...personaIds, ...visitorIds];
        const sessions = await prisma.demoSession.findMany({
          where: { creatorId: { in: everyone } },
          select: { id: true },
        });
        const sessionIds = sessions.map((s) => s.id);
        await prisma.idempotencyRecord.deleteMany({ where: { sessionId: { in: sessionIds } } });
        await prisma.demoSession.deleteMany({ where: { id: { in: sessionIds } } });
        await prisma.accessCode.deleteMany({ where: { label: { startsWith: prefix } } });
        await prisma.creator.deleteMany({ where: { id: { in: extraCreatorIds } } });
        await prisma.$disconnect();
      }
      await app?.close();
      vi.unstubAllEnvs();
      if (storageDir) await rm(storageDir, { recursive: true, force: true });
      if (assetsDir) await rm(assetsDir, { recursive: true, force: true });
      console.log(`reset timings (ms, wall clock): ${JSON.stringify(timings)}`);
    });

    it('rejects a missing/wrong admin token and a bad scope', async () => {
      expect((await reset('persona', null)).status).toBe(401);
      expect((await reset('persona', 'wrong')).status).toBe(401);
      expect((await reset('everything')).status).toBe(400);
    });

    it('seed content has the documented size and passes the identity targets through the API', async () => {
      expect((await counts(seedIds)).projects).toBe(expectedSeed.projects);
      expect(
        await prisma.project.count({
          where: { ownerId: { in: seedIds }, status: 'finished', postedAt: { not: null } },
        }),
      ).toBe(expectedSeed.projects);
      expect(
        await prisma.topic.count({ where: { id: { in: plan.topics.map((t) => t.id) } } }),
      ).toBe(plan.topics.length);
      expect(
        await prisma.agoraComment.count({ where: { project: { ownerId: { in: seedIds } } } }),
      ).toBe(commentsOnSeed);
      const viewer = await newFreshCreator();
      for (const c of plan.creators) {
        const res = await call('GET', `/creators/${c.id}/identity`, viewer.token);
        expect(res.status).toBe(200);
        const { snapshot } = IdentityResponseSchema.parse(await res.json());
        const t = c.spec.target;
        const a = snapshot.axes;
        expect(Math.abs(a.scaleIntensity! - t.A), `${c.key} A`).toBeLessThanOrEqual(10);
        expect(Math.abs(a.aiRelation! - t.B), `${c.key} B`).toBeLessThanOrEqual(10);
        expect(Math.abs(a.decisionBasis! - t.C), `${c.key} C`).toBeLessThanOrEqual(10);
        expect(Math.abs(a.direction! - t.D), `${c.key} D`).toBeLessThanOrEqual(10);
        expect(snapshot.provisional).toBe(c.spec.projects.length < 3);
      }
    });

    it('agora home has no empty section; compare and rising candidates are filled', async () => {
      const viewer = await newFreshCreator();
      const home = AgoraHomeResponseSchema.parse(
        await (await call('GET', '/agora', viewer.token)).json(),
      );
      expect(home.recommended.length).toBeGreaterThan(0);
      expect(home.risingCreators.length).toBeGreaterThan(0);
      expect(home.hotTopics.length).toBeGreaterThanOrEqual(3);
      expect(home.hotTopics.every((t) => t.projects.length > 0)).toBe(true);

      const compare = CompareResponseSchema.parse(
        await (await call('GET', '/identity/compare', viewer.token)).json(),
      );
      expect(compare.others).toHaveLength(5);
      for (const entry of compare.others) {
        expect(Object.values(entry.axes).every((v) => v !== null)).toBe(true);
      }
      const byName = (name: string) => compare.others.find((e) => e.creator.displayName === name)!;
      expect(byName('Nichole').axes.decisionBasis!).toBeGreaterThan(0);
      expect(byName('Lind').axes.decisionBasis!).toBeGreaterThan(0);
      expect(byName('Judy').axes.decisionBasis!).toBeLessThan(0);
      expect(byName('Jay').axes.decisionBasis!).toBeLessThan(0);

      const rising = RemixCandidatesResponseSchema.parse(
        await (await call('GET', '/remix/candidates?tab=rising', viewer.token)).json(),
      );
      const ids = rising.creators.map((c) => c.id);
      for (const id of [...seedIds, ...personaIds]) expect(ids).toContain(id);
    });

    it('picking a seed creator as the remix partner gives at least one Connection with evidence >= 3', async () => {
      const owner = await newFreshCreator();
      await prisma.creator.update({
        where: { id: owner.creatorId },
        data: { identityPublic: true },
      });
      const fixture = await createFixtureProject(owner.token);
      const partner = plan.creators.find((c) => c.key === 'seed-3')!; // Rhys, evidence-first
      const put = await call('PUT', `/projects/${fixture.projectId}/remix-partner`, owner.token, {
        partnerId: partner.id,
      });
      expect(put.status).toBe(200);
      const res = await call('GET', `/answers/${fixture.answerId}/connections`, owner.token);
      expect(res.status).toBe(200);
      const { connections } = ConnectionListResponseSchema.parse(await res.json());
      expect(connections.length).toBeGreaterThanOrEqual(1);
      const rows = await prisma.connection.findMany({ where: { answerId: fixture.answerId } });
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.every((row) => row.evidenceTotal >= 3)).toBe(true);
      // 방금 만든 프로젝트·Connection 정리(스냅샷은 시드 쪽이라 남겨도 된다).
      await prisma.project.delete({ where: { id: fixture.projectId } });
    });

    it('loading the seed twice gives the same rows and values (idempotent)', async () => {
      const owners = [...seedIds, ...personaIds];
      const before = { counts: await counts(owners), hash: await contentHash(owners) };
      await load(owners);
      await load(owners);
      expect(await counts(owners)).toEqual(before.counts);
      expect(await contentHash(owners)).toBe(before.hash);
      expect(before.counts.projects).toBe(expectedSeed.projects + personaProjectCount);
      expect(before.counts.answers).toBe(plan.answers.length);
      expect(before.counts.events).toBe(plan.events.length);
      // 노드 코멘트(#247): 두 번 적재해도 계획 수 그대로, 같은 값.
      expect(await liveSeedNodeComments()).toBe(plan.nodeComments.length);
      const rows = await prisma.nodeComment.findMany({
        where: { id: { in: seedNodeCommentIds } },
        orderBy: { id: 'asc' },
      });
      expect(
        rows.map((r) => [r.id, r.answerId, r.nodeId, r.authorId, r.body, r.createdAt.getTime()]),
      ).toEqual(
        [...plan.nodeComments]
          .sort((a, b) => (a.id < b.id ? -1 : 1))
          .map((c) => [c.id, c.answerId, c.nodeId, c.authorId, c.body, c.createdAt.getTime()]),
      );
      // 시드 accepted 답변은 확정 시각(acceptedAt)이 createdAt 으로 채워진다.
      const accepted = await prisma.answer.findMany({
        where: { id: { in: plan.answers.map((a) => a.id) }, status: 'accepted' },
      });
      expect(accepted.length).toBeGreaterThan(0);
      for (const a of accepted) expect(a.acceptedAt?.getTime()).toBe(a.createdAt.getTime());
    });

    it('reset persona: restores persona content, keeps sessions/consent, leaves seed and visitor alone', async () => {
      const priya = personaIds[0]!;
      const token = await loginAs(priya);
      const sessionsBefore = await prisma.demoSession.count({ where: { creatorId: priya } });
      const consentsBefore = await prisma.consentRecord.count({ where: { creatorId: priya } });
      const baseline = await counts(personaIds);
      const baselineHash = await contentHash(personaIds);

      // persona 가 쌓은 것: 새 프로젝트(이미지 객체 포함)·제목 변경·즐겨찾기·댓글·노드 코멘트·스냅샷.
      const extra = await createFixtureProject(token);
      const extraAnswer = await prisma.answer.findUniqueOrThrow({ where: { id: extra.answerId } });
      await storage.get(extraAnswer.imageKey); // 객체가 있다.
      await prisma.project.update({
        where: { id: plan.projects.find((p) => p.key === 'priya-1')!.id },
        data: { title: 'Changed title' },
      });
      const seedProject = plan.projects.find((p) => p.key === 'mara-1')!;
      await prisma.favorite.create({ data: { creatorId: priya, targetCreatorId: seedIds[0]! } });
      await prisma.agoraComment.create({
        data: { projectId: seedProject.id, authorId: priya, body: 'persona comment' },
      });
      await prisma.nodeComment.create({
        data: { answerId: extra.answerId, nodeId: 'k1', authorId: priya, body: 'note' },
      });
      await call('GET', `/creators/${priya}/identity`, token); // 스냅샷 생성
      expect(await prisma.identitySnapshot.count({ where: { creatorId: priya } })).toBeGreaterThan(
        0,
      );
      // visitor 쪽 흔적은 persona 리셋이 건드리지 않아야 한다.
      const visitorComment = await prisma.agoraComment.create({
        data: { projectId: seedProject.id, authorId: visitorIds[0]!, body: 'visitor comment' },
      });
      const seedBefore = await counts(seedIds);

      const result = await runReset('persona');
      expect(result.deleted).toBe(personaProjectCount + 1); // persona 시드 프로젝트 + 방금 만든 1
      expect(result.ms).toBeGreaterThanOrEqual(0);

      expect(await counts(personaIds)).toEqual(baseline);
      expect(await contentHash(personaIds)).toBe(baselineHash);
      expect(await prisma.project.findUnique({ where: { id: extra.projectId } })).toBeNull();
      expect(
        (
          await prisma.project.findUniqueOrThrow({
            where: { id: plan.projects.find((p) => p.key === 'priya-1')!.id },
          })
        ).title,
      ).toBe(plan.projects.find((p) => p.key === 'priya-1')!.title);
      expect(await prisma.favorite.count({ where: { creatorId: priya } })).toBe(0);
      // persona 가 단 시드 댓글·노드 코멘트(#247)만 되돌아온다(방금 단 것은 지워졌다).
      expect(await prisma.agoraComment.count({ where: { authorId: priya } })).toBe(
        plan.comments.filter((c) => c.authorId === priya).length,
      );
      expect(await prisma.nodeComment.count({ where: { authorId: priya } })).toBe(
        plan.nodeComments.filter((c) => c.authorId === priya).length,
      );
      expect(await prisma.identitySnapshot.count({ where: { creatorId: priya } })).toBe(0);
      // 세션·동의는 그대로, 토큰도 계속 쓸 수 있다.
      expect(await prisma.demoSession.count({ where: { creatorId: priya } })).toBe(sessionsBefore);
      expect(await prisma.consentRecord.count({ where: { creatorId: priya } })).toBe(
        consentsBefore,
      );
      expect((await call('GET', '/me', token)).status).toBe(200);
      // seed·visitor 는 그대로.
      expect(await counts(seedIds)).toEqual(seedBefore);
      expect(
        await prisma.agoraComment.findUnique({ where: { id: visitorComment.id } }),
      ).not.toBeNull();
      // 지운 답변의 저장소 객체도 지워졌다.
      await expect(storage.get(extraAnswer.imageKey)).rejects.toBeTruthy();
      await prisma.agoraComment.delete({ where: { id: visitorComment.id } });
    });

    it('reset visitor: wipes visitor data, keeps accounts, resets the cursor, leaves persona alone', async () => {
      const visitor = visitorIds[0]!;
      const token = await loginAs(visitor);
      const fixture = await createFixtureProject(token);
      const answer = await prisma.answer.findUniqueOrThrow({ where: { id: fixture.answerId } });
      const seedProject = plan.projects.find((p) => p.key === 'dove-1')!;
      await prisma.favorite.create({ data: { creatorId: visitor, targetCreatorId: seedIds[1]! } });
      await prisma.agoraComment.create({
        data: { projectId: seedProject.id, authorId: visitor, body: 'visitor says hi' },
      });
      await call('GET', `/creators/${visitor}/identity`, token);
      await prisma.appSetting.upsert({
        where: { key: 'visitorCursor' },
        update: { value: 4 },
        create: { key: 'visitorCursor', value: 4 },
      });
      const personaBefore = await counts(personaIds);
      expect(await prisma.demoSession.count({ where: { creatorId: visitor } })).toBeGreaterThan(0);

      const result = await runReset('visitor');
      expect(result.deleted).toBe(1);

      expect(await prisma.project.count({ where: { ownerId: { in: visitorIds } } })).toBe(0);
      expect(await prisma.event.count({ where: { creatorId: { in: visitorIds } } })).toBe(0);
      expect(await prisma.demoSession.count({ where: { creatorId: { in: visitorIds } } })).toBe(0);
      expect(await prisma.consentRecord.count({ where: { creatorId: { in: visitorIds } } })).toBe(
        0,
      );
      expect(await prisma.agoraComment.count({ where: { authorId: { in: visitorIds } } })).toBe(0);
      expect(await prisma.favorite.count({ where: { creatorId: { in: visitorIds } } })).toBe(0);
      expect(
        await prisma.identitySnapshot.count({ where: { creatorId: { in: visitorIds } } }),
      ).toBe(0);
      expect(await prisma.creator.count({ where: { id: { in: visitorIds } } })).toBe(5);
      const cursor = await prisma.appSetting.findUniqueOrThrow({ where: { key: 'visitorCursor' } });
      expect(cursor.value).toBe(0);
      expect(await counts(personaIds)).toEqual(personaBefore);
      expect((await call('GET', '/me', token)).status).toBe(401); // 세션이 지워졌다.
      await expect(storage.get(answer.imageKey)).rejects.toBeTruthy();
    });

    it('reset all-nonseed: persona + visitor cleared, seed back to the seed state', async () => {
      const seedBaseline = await counts(seedIds);
      const seedHash = await contentHash(seedIds);
      const seedProject = plan.projects.find((p) => p.key === 'rhys-1')!;
      const owner = await newFreshCreator();
      const fixture = await createFixtureProject(owner.token);
      const priya = personaIds[0]!;
      await prisma.project.update({
        where: { id: seedProject.id },
        data: { title: 'Hacked title' },
      });
      await prisma.projectStat.update({
        where: { projectId: seedProject.id },
        data: { viewCount: 9999 },
      });
      await prisma.agoraComment.create({
        data: { projectId: seedProject.id, authorId: priya, body: 'persona on seed' },
      });
      await prisma.agoraComment.create({
        data: { projectId: seedProject.id, authorId: owner.creatorId, body: 'stranger on seed' },
      });
      const seedAnswer = plan.answers.find((a) => a.projectKey === 'rhys-1')!;
      await prisma.nodeComment.create({
        data: { answerId: seedAnswer.id, nodeId: 'k1', authorId: priya, body: 'note on seed' },
      });
      await prisma.project.update({
        where: { id: fixture.projectId },
        data: { remixPartnerId: seedIds[0]! },
      });
      const visitorToken = await loginAs(visitorIds[1]!);
      expect((await call('GET', '/me', visitorToken)).status).toBe(200);

      const result = await runReset('all-nonseed');
      expect(result.deleted).toBeGreaterThanOrEqual(5);

      expect(await counts(seedIds)).toEqual(seedBaseline);
      expect(await contentHash(seedIds)).toBe(seedHash);
      expect(
        (await prisma.project.findUniqueOrThrow({ where: { id: seedProject.id } })).title,
      ).toBe(seedProject.title);
      const stat = await prisma.projectStat.findUniqueOrThrow({
        where: { projectId: seedProject.id },
      });
      expect(stat.viewCount).toBe(
        plan.stats.find((s) => s.projectId === seedProject.id)!.viewCount,
      );
      expect(
        await prisma.agoraComment.count({ where: { project: { ownerId: { in: seedIds } } } }),
      ).toBe(commentsOnSeed);
      expect(await prisma.nodeComment.count({ where: { answerId: seedAnswer.id } })).toBe(
        plan.nodeComments.filter((c) => c.answerId === seedAnswer.id).length,
      );
      expect(await liveSeedNodeComments()).toBe(plan.nodeComments.length);
      expect(await prisma.project.count({ where: { ownerId: { in: visitorIds } } })).toBe(0);
      expect(await prisma.demoSession.count({ where: { creatorId: { in: visitorIds } } })).toBe(0);
      expect((await counts(personaIds)).projects).toBe(personaProjectCount);
      // 남는 즐겨찾기는 쇼케이스 계정의 시드 즐겨찾기뿐이다.
      expect(
        await prisma.favorite.count({
          where: { creatorId: { in: [...personaIds, ...visitorIds] } },
        }),
      ).toBe(showcaseFavorites.length);
      // 공통 데이터는 남는다.
      expect(
        await prisma.topic.count({ where: { id: { in: plan.topics.map((t) => t.id) } } }),
      ).toBe(plan.topics.length);
      expect(await prisma.sampleResult.count()).toBeGreaterThanOrEqual(0);
    }, 60_000);

    it('showcase account: shelf, remix/derive links, favorites and identity are seeded', async () => {
      const token = await loginAs(SHOWCASE_CREATOR_ID);
      const shelf = ProjectListResponseSchema.parse(
        await (await call('GET', '/projects', token)).json(),
      );
      expect(shelf.projects).toHaveLength(showcaseProjects.length);
      expect(shelf.projects.filter((p) => p.kind === 'derive').length).toBe(
        showcaseProjects.filter((p) => p.kind === 'derive').length,
      );
      expect(shelf.projects.filter((p) => p.remixPartner !== undefined).length).toBe(
        showcaseProjects.filter((p) => p.remixPartnerId !== null).length,
      );
      expect(shelf.projects.filter((p) => p.posted).length).toBe(
        showcaseProjects.filter((p) => p.postedAt !== null).length,
      );
      expect(shelf.projects.some((p) => p.status === 'building')).toBe(true);
      expect(shelf.projects.every((p) => p.coverThumbUrl !== null)).toBe(true);

      const rows = await prisma.project.findMany({ where: { ownerId: SHOWCASE_CREATOR_ID } });
      for (const p of showcaseProjects.filter((x) => x.kind === 'derive')) {
        const row = rows.find((r) => r.id === p.id)!;
        expect(row.derivedFromProjectId).toBe(p.derivedFromProjectId);
        expect(row.derivedFromAnswerId).toBe(p.derivedFromAnswerId);
      }
      expect(
        (await prisma.favorite.findMany({ where: { creatorId: SHOWCASE_CREATOR_ID } }))
          .map((f) => f.targetCreatorId)
          .sort(),
      ).toEqual(showcaseFavorites.map((f) => f.targetCreatorId).sort());
      const pinned = await prisma.answer.count({
        where: { pinned: true, set: { project: { ownerId: SHOWCASE_CREATOR_ID } } },
      });
      expect(pinned).toBe(plan.answers.filter((a) => a.pinned).length);

      const me = IdentityResponseSchema.parse(
        await (await call('GET', `/creators/${SHOWCASE_CREATOR_ID}/identity`, token)).json(),
      );
      expect(me.snapshot.provisional).toBe(false);
      expect(me.snapshot.metrics.originBreakdown.remix).toBeGreaterThan(0);
      expect(me.snapshot.metrics.originBreakdown.derived).toBeGreaterThan(0);
      const compare = CompareResponseSchema.parse(
        await (await call('GET', '/identity/compare', token)).json(),
      );
      expect(Object.values(compare.me.axes).every((v) => v !== null)).toBe(true);
      expect(compare.others).toHaveLength(5);

      // 리믹스 프로젝트 답변에서 Connection 을 열면 상대 스냅샷이 고정되고 근거가 나온다.
      const remix = showcaseProjects.find((p) => p.key === 'julian-2')!;
      const res = await call('GET', `/answers/${remix.coverAnswerId}/connections`, token);
      expect(res.status).toBe(200);
      expect(
        (await prisma.project.findUniqueOrThrow({ where: { id: remix.id } }))
          .remixPartnerSnapshotId,
      ).not.toBeNull();

      // 쇼케이스 계정이 바뀌어도 persona 리셋이 시드 상태로 되돌린다.
      await prisma.favorite.deleteMany({ where: { creatorId: SHOWCASE_CREATOR_ID } });
      await prisma.agoraComment.deleteMany({ where: { authorId: SHOWCASE_CREATOR_ID } });
      await prisma.project.update({
        where: { id: showcaseProjects[0]!.id },
        data: { title: 'Changed', deletedAt: new Date() },
      });
      await runReset('persona');
      expect(await prisma.favorite.count({ where: { creatorId: SHOWCASE_CREATOR_ID } })).toBe(
        showcaseFavorites.length,
      );
      expect(await prisma.agoraComment.count({ where: { authorId: SHOWCASE_CREATOR_ID } })).toBe(
        plan.comments.filter((c) => c.authorId === SHOWCASE_CREATOR_ID).length,
      );
      const restored = await prisma.project.findUniqueOrThrow({
        where: { id: showcaseProjects[0]!.id },
      });
      expect(restored.title).toBe(showcaseProjects[0]!.title);
      expect(restored.deletedAt).toBeNull();
      expect((await call('GET', '/me', token)).status).toBe(200);
    }, 60_000);

    it('showcase details (#247): node comments, profile reach, agora comments and the showcase code', async () => {
      // 쇼케이스 코드: 시드 스크립트와 같은 함수로 등록하면 그 코드로 쇼케이스 계정에 들어간다.
      // 이 테스트 DB 의 실제 label(showcase)은 건드리지 않도록 접두어 label 을 쓴다.
      const code = `showcase-${randomUUID()}`;
      const label = `${prefix} showcase`;
      const first = await registerShowcaseAccessCode(prisma, code, label);
      const again = await registerShowcaseAccessCode(prisma, code, label);
      expect(again.id).toBe(first.id);
      expect(await prisma.accessCode.count({ where: { label } })).toBe(1);
      const row = await prisma.accessCode.findUniqueOrThrow({ where: { id: first.id } });
      expect(row.codeHash).not.toContain(code);
      expect(row).toMatchObject({
        target: 'creator',
        creatorId: SHOWCASE_CREATOR_ID,
        active: true,
      });
      const login = await fetch(`${base}/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      expect(login.status).toBe(200);
      const session = CreateSessionResponseSchema.parse(await login.json());
      await prisma.accessCode.update({ where: { id: first.id }, data: { active: false } });
      await call('POST', '/session/consent', session.token, {
        noticeVersion: session.noticeVersion,
      });
      const token = session.token;
      const me = MeResponseSchema.parse(await (await call('GET', '/me', token)).json());
      expect(me.creator.id).toBe(SHOWCASE_CREATOR_ID);

      // 노드 코멘트: 6장 쌓인 대표작의 마지막 버전에 내 이유와 남의 코멘트가 함께 보인다.
      const hero = plan.answers.find((a) => a.projectKey === 'julian-1' && a.number === 6)!;
      const listed = NodeCommentListResponseSchema.parse(
        await (await call('GET', `/answers/${hero.id}/comments`, token)).json(),
      );
      const planned = plan.nodeComments.filter((c) => c.answerId === hero.id);
      expect(listed.comments.map((c) => c.id).sort()).toEqual(planned.map((c) => c.id).sort());
      expect(listed.comments.some((c) => c.mine)).toBe(true);
      expect(listed.comments.some((c) => !c.mine)).toBe(true);
      // 내 시드 코멘트는 지울 수 있고, persona 리셋이 시드 상태로 되살린다.
      const mine = listed.comments.find((c) => c.mine)!;
      expect((await call('DELETE', `/node-comments/${mine.id}`, token)).status).toBe(204);
      expect(await liveSeedNodeComments()).toBe(plan.nodeComments.length - 1);
      await runReset('persona');
      expect(await liveSeedNodeComments()).toBe(plan.nodeComments.length);

      // 프로필 도달: Remixed by 6 · Derived by 3
      const profile = CreatorProfileResponseSchema.parse(
        await (await call('GET', `/creators/${SHOWCASE_CREATOR_ID}`, token)).json(),
      );
      expect(profile.remixedBy.count).toBe(6);
      expect(profile.derivedBy.count).toBe(3);

      // 아고라: Urban Trail 스니커 상세에 댓글 12개
      const sneaker = plan.projects.find((p) => p.key === 'isla-2')!;
      expect(await prisma.agoraComment.count({ where: { projectId: sneaker.id } })).toBe(12);
      // 이 코드 행은 afterAll 이 접두어 label 로 지운다(세션이 가리키고 있어 지금은 못 지운다).
    }, 60_000);

    it('avatars: summaries carry the avatar url, the route redirects to the image, others get null/404', async () => {
      const lind = seedIds[0]!;
      const token = await loginAs(SHOWCASE_CREATOR_ID);
      const me = MeResponseSchema.parse(await (await call('GET', '/me', token)).json());
      expect(me.creator.avatarUrl).toBe(`/assets/creators/${SHOWCASE_CREATOR_ID}/avatar`);

      // 아고라 작가 정보·라이징 크리에이터에도 같은 경로가 실린다.
      const detail = AgoraProjectResponseSchema.parse(
        await (
          await call(
            'GET',
            `/agora/projects/${plan.projects.find((p) => p.key === 'mara-1')!.id}`,
            token,
          )
        ).json(),
      );
      expect(detail.author.avatarUrl).toBe(`/assets/creators/${lind}/avatar`);
      expect(detail.project.author.avatarUrl).toBe(`/assets/creators/${lind}/avatar`);
      const home = AgoraHomeResponseSchema.parse(await (await call('GET', '/agora', token)).json());
      const rising = home.risingCreators.find((c) => c.id === lind);
      expect(rising?.avatarUrl).toBe(`/assets/creators/${lind}/avatar`);
      // 이미지가 없는 창작자는 null(이 DB 에 남은 이전 값과 무관하게 새 창작자로 본다).
      const plain = await newFreshCreator();
      const plainMe = MeResponseSchema.parse(await (await call('GET', '/me', plain.token)).json());
      expect(plainMe.creator.avatarUrl).toBeNull();

      // 경로: 세션 토큰이 있어야 하고(답변 이미지와 같음), 서명 URL 로 302 → 이미지 바이트.
      const path = `/assets/creators/${lind}/avatar`;
      expect((await fetch(`${base}${path}`, { redirect: 'manual' })).status).toBe(401);
      const res = await fetch(`${base}${path}`, {
        headers: { authorization: `Bearer ${token}` },
        redirect: 'manual',
      });
      expect(res.status).toBe(302);
      const image = await fetch(new URL(res.headers.get('location')!, base));
      expect(image.status).toBe(200);
      expect(image.headers.get('content-type')).toBe('image/jpeg');
      // 이미지가 없는 창작자·없는 창작자·잘못된 id
      const noImage = await call('GET', `/assets/creators/${plain.creatorId}/avatar`, token);
      expect(noImage.status).toBe(404);
      expect((await call('GET', `/assets/creators/${randomUUID()}/avatar`, token)).status).toBe(
        404,
      );
      expect((await call('GET', '/assets/creators/not-a-uuid/avatar', token)).status).toBe(400);
    });

    it('two simultaneous resets queue up and both finish with a consistent result', async () => {
      const baseline = await counts([...seedIds, ...personaIds]);
      const [a, b] = await Promise.all([runReset('all-nonseed'), runReset('all-nonseed')]);
      expect(a.deleted + b.deleted).toBeGreaterThanOrEqual(0);
      expect(await counts([...seedIds, ...personaIds])).toEqual(baseline);
      // 리셋 두 번이 줄을 서므로 기본 5초보다 길게 둔다(각각 1분 목표는 아래 테스트가 본다).
    }, 120_000);

    it('every reset finishes well inside one minute', () => {
      for (const ms of Object.values(timings)) expect(ms).toBeLessThan(60_000);
    });
  },
);
