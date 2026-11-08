import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Test } from '@nestjs/testing';
import { HealthResponseSchema } from '@tome/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client';

// 실제 Postgres(마이그레이션 적용 완료)가 있을 때만 돈다. TEST_DATABASE_URL 이 없으면 건너뛴다.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('database constraints and /health (real Postgres)', () => {
  let prisma: PrismaClient;
  let creatorId: string;
  let sessionId: string;
  const runId = randomUUID();

  const newProject = () =>
    prisma.project.create({
      data: { ownerId: creatorId, kind: 'original', title: 't', shelfPosition: 0 },
    });
  const newPage = (projectId: string, index = 0) =>
    prisma.page.create({ data: { projectId, index } });
  const newSet = (projectId: string, pageId: string, position: number) =>
    prisma.promptSet.create({ data: { projectId, pageId, position, prompt: 'p' } });
  const newAnswer = (setId: string, number: number | null) =>
    prisma.answer.create({
      data: {
        setId,
        status: number === null ? 'draft' : 'accepted',
        number,
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
  const newJob = (projectId: string, setId: string, status: 'pending' | 'running' | 'succeeded') =>
    prisma.generationJob.create({
      data: {
        projectId,
        setId,
        kind: 'create',
        startStage: 'analyze',
        status,
        idempotencyKey: randomUUID(),
        createdBySessionId: sessionId,
      },
    });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const creator = await prisma.creator.create({
      data: { kind: 'visitor', displayName: `db-test ${runId.slice(0, 8)}` },
    });
    creatorId = creator.id;
    const code = await prisma.accessCode.create({
      data: { label: `db-test ${runId}`, codeHash: 'x', target: 'visitor_pool' },
    });
    const session = await prisma.demoSession.create({
      data: {
        tokenHash: `db-test-${runId}`,
        creatorId,
        accessCodeId: code.id,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    sessionId = session.id;
  });

  // 이 테스트가 만든 행만 지운다. Creator 를 지우면 프로젝트 이하가 연쇄 삭제된다.
  afterAll(async () => {
    await prisma.demoSession.deleteMany({ where: { creatorId } });
    await prisma.accessCode.deleteMany({ where: { label: { startsWith: 'db-test' } } });
    await prisma.creator.deleteMany({ where: { id: creatorId } });
    await prisma.$disconnect();
  });

  it('rejects a 4th PromptSet on the same page (position CHECK)', async () => {
    const project = await newProject();
    const page = await newPage(project.id);
    for (const position of [1, 2, 3]) await newSet(project.id, page.id, position);
    await expect(newSet(project.id, page.id, 4)).rejects.toThrow();
    await expect(newSet(project.id, page.id, 0)).rejects.toThrow();
    expect(await prisma.promptSet.count({ where: { pageId: page.id } })).toBe(3);
  });

  it('rejects a second pending/running job on one project (partial unique)', async () => {
    const project = await newProject();
    const page = await newPage(project.id);
    const set = await newSet(project.id, page.id, 1);
    await newJob(project.id, set.id, 'pending');
    await expect(newJob(project.id, set.id, 'running')).rejects.toThrow();
    await expect(newJob(project.id, set.id, 'pending')).rejects.toThrow();
    // 끝난 job 은 여러 개 있어도 된다.
    await newJob(project.id, set.id, 'succeeded');
    await newJob(project.id, set.id, 'succeeded');
  });

  it('allows a new active job once the previous one has finished', async () => {
    const project = await newProject();
    const page = await newPage(project.id);
    const set = await newSet(project.id, page.id, 1);
    const first = await newJob(project.id, set.id, 'running');
    await prisma.generationJob.update({ where: { id: first.id }, data: { status: 'succeeded' } });
    await newJob(project.id, set.id, 'pending');
  });

  it('rejects Page index 10 and negative index (index CHECK)', async () => {
    const project = await newProject();
    await newPage(project.id, 0);
    await newPage(project.id, 9);
    await expect(newPage(project.id, 10)).rejects.toThrow();
    await expect(newPage(project.id, -1)).rejects.toThrow();
  });

  it('rejects an AccessCode that breaks the creator target CHECK', async () => {
    const label = `db-test ${runId} check`;
    await expect(
      prisma.accessCode.create({ data: { label, codeHash: 'x', target: 'creator' } }),
    ).rejects.toThrow();
    await expect(
      prisma.accessCode.create({
        data: { label, codeHash: 'x', target: 'visitor_pool', creatorId },
      }),
    ).rejects.toThrow();
    const ok = await prisma.accessCode.create({
      data: { label, codeHash: 'x', target: 'creator', creatorId },
    });
    expect(ok.target).toBe('creator');
    // creatorId 는 RESTRICT 라 코드를 먼저 지운다(afterAll 도 같은 순서).
    await prisma.accessCode.delete({ where: { id: ok.id } });
  });

  it('rejects a duplicate Answer number in a set but allows many drafts', async () => {
    const project = await newProject();
    const page = await newPage(project.id);
    const set = await newSet(project.id, page.id, 1);
    const otherSet = await newSet(project.id, page.id, 2);
    await newAnswer(set.id, 1);
    await expect(newAnswer(set.id, 1)).rejects.toThrow();
    await newAnswer(set.id, 2);
    await newAnswer(otherSet.id, 1);
    await newAnswer(set.id, null);
    await newAnswer(set.id, null);
  });

  it('GET /health returns 200 and a body that passes HealthResponseSchema', async () => {
    vi.stubEnv('DATABASE_URL', url!);
    vi.stubEnv('AI_PROVIDER', 'mock');
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app: INestApplication = moduleRef.createNestApplication();
    await app.init();
    try {
      await app.listen(0);
      const res = await fetch(`${await app.getUrl()}/health`);
      expect(res.status).toBe(200);
      const body = HealthResponseSchema.parse(await res.json());
      expect(body).toMatchObject({ status: 'ok', db: 'up' });

      const missing = await fetch(`${await app.getUrl()}/no-such-route`);
      expect(missing.status).toBe(404);
      expect(await missing.json()).toMatchObject({
        error: { code: 'NOT_FOUND', retryable: false },
      });
    } finally {
      await app.close();
      vi.unstubAllEnvs();
    }
  });
});
