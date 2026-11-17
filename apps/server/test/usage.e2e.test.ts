import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AdminSettingsResponseSchema,
  AdminUsageResponseSchema,
  AdvanceJobResponseSchema,
  ApiErrorSchema,
  CreateProjectResponseSchema,
  CreateSessionResponseSchema,
  CreateSetResponseSchema,
  MeResponseSchema,
  type JobStage,
  PROMPT_PRESETS,
  WorkspaceResponseSchema,
} from '@tome/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_PROVIDER, type AiProvider, type AiResult, MockAiProvider, MODELS } from '../src/ai';
import { AppError } from '../src/common';
import { PrismaClient } from '../src/generated/prisma/client';
import { LoginRateLimiter } from '../src/modules/session/login-rate-limiter';
import { PrismaService } from '../src/prisma/prisma.service';
import { OBJECT_STORAGE, type ObjectStorage } from '../src/storage';
import { SEED_CREATORS } from '../prisma/seed/creators';
import { loadSampleResults } from '../prisma/seed/sample-results';

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
const PRESET = PROMPT_PRESETS[0];
const SETTING_KEYS = ['dailyNeuronCap', 'monthlyCostCapUsd'];
const today = () => new Date().toISOString().slice(0, 10);

/** mock 을 감싸 실패를 주입하는 시험용 공급자. */
class TestAiProvider implements AiProvider {
  readonly name = 'mock';
  private inner: AiProvider = new MockAiProvider();
  calls: Record<string, number> = {};
  failures: Record<string, Array<Error>> = {};

  useInner(inner: AiProvider): void {
    this.inner = inner;
  }

  reset(): void {
    this.inner = new MockAiProvider();
    this.calls = {};
    this.failures = {};
  }

  private async run<T>(stage: string, fn: () => Promise<T>): Promise<T> {
    this.calls[stage] = (this.calls[stage] ?? 0) + 1;
    const failure = this.failures[stage]?.shift();
    if (failure) throw failure;
    return fn();
  }

  analyze: AiProvider['analyze'] = (input) => this.run('analyze', () => this.inner.analyze(input));
  research: AiProvider['research'] = (input) =>
    this.run('research', () => this.inner.research(input));
  evidence: AiProvider['evidence'] = (input) =>
    this.run('evidence', () => this.inner.evidence(input));
  draft: AiProvider['draft'] = (input) => this.run('draft', () => this.inner.draft(input));
  image: AiProvider['image'] = (input) => this.run('image', () => this.inner.image(input));
}

/** 실제 공급자처럼 폴백 사용·neurons 를 알려 주는 척하는 공급자(텍스트만 neurons 를 알려 준다). */
class CostlyProvider implements AiProvider {
  readonly name = 'mock';
  private inner = new MockAiProvider();
  private tag = <T>(r: AiResult<T>, model: string, neurons?: number): AiResult<T> => ({
    ...r,
    provider: 'workers-ai',
    model,
    fallbackUsed: true,
    ...(neurons === undefined ? {} : { neurons }),
  });
  analyze: AiProvider['analyze'] = async () =>
    this.tag(await this.inner.analyze(), MODELS.textFallback, 100);
  research: AiProvider['research'] = async () =>
    this.tag(await this.inner.research(), MODELS.textFallback, 100);
  evidence: AiProvider['evidence'] = async () =>
    this.tag(await this.inner.evidence(), MODELS.textFallback, 100);
  draft: AiProvider['draft'] = async () =>
    this.tag(await this.inner.draft(), MODELS.textFallback, 100);
  image: AiProvider['image'] = async () => this.tag(await this.inner.image(), MODELS.imageFallback);
}

interface Owner {
  creatorId: string;
  token: string;
}

describe.skipIf(!url)(
  'usage limits, accounting and sample results (real Postgres)',
  { timeout: 30_000 },
  () => {
    let app: INestApplication;
    let base: string;
    let prisma: PrismaClient;
    let storageDir: string;
    const ai = new TestAiProvider();
    const prefix = `e2e-usage-${randomUUID()}`;
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
    const admin = (
      method: string,
      path: string,
      body?: unknown,
      token: string | null = ADMIN_TOKEN,
    ) =>
      fetch(`${base}${path}`, {
        method,
        headers: {
          ...(token ? { 'x-admin-token': token } : {}),
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
      const put = await admin(
        'PUT',
        `/admin/access-codes/${encodeURIComponent(`${prefix} ${creator.id}`)}`,
        {
          code,
          target: 'creator',
          creatorId: creator.id,
          active: true,
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

    const newEmptyProject = async (owner: Owner) => {
      const res = await call('POST', '/projects', owner.token, {}, randomUUID());
      expect(res.status).toBe(201);
      const { project } = CreateProjectResponseSchema.parse(await res.json());
      const wsRes = await call('GET', `/projects/${project.id}/workspace`, owner.token);
      const ws = WorkspaceResponseSchema.parse(await wsRes.json());
      return { projectId: project.id, pageId: ws.currentPageId };
    };
    const createSet = (
      owner: Owner,
      projectId: string,
      pageId: string,
      prompt: string,
      presetKey?: string,
    ) =>
      call(
        'POST',
        `/projects/${projectId}/sets`,
        owner.token,
        { pageId, prompt, ...(presetKey ? { presetKey } : {}) },
        randomUUID(),
      );
    const advance = (owner: Owner, jobId: string, stage: string) =>
      call('POST', `/jobs/${jobId}/advance`, owner.token, { stage });
    const advanceOk = async (owner: Owner, jobId: string, stage: JobStage) => {
      const res = await advance(owner, jobId, stage);
      expect(res.status).toBe(200);
      return AdvanceJobResponseSchema.parse(await res.json());
    };
    const runStages = async (owner: Owner, jobId: string, stages: readonly JobStage[]) => {
      let last;
      for (const stage of stages) last = await advanceOk(owner, jobId, stage);
      return last!;
    };
    /** 프롬프트로 새 프로젝트(세트·job 포함)를 만든다. */
    const createWithPrompt = async (owner: Owner, prompt: string, presetKey?: string) => {
      const res = await call(
        'POST',
        '/projects',
        owner.token,
        { prompt, ...(presetKey ? { presetKey } : {}) },
        randomUUID(),
      );
      return res;
    };

    const setCaps = async (caps: { dailyNeuronCap?: number; monthlyCostCapUsd?: number }) => {
      const res = await admin('PUT', '/admin/settings', caps);
      expect(res.status).toBe(200);
      return AdminSettingsResponseSchema.parse(await res.json());
    };
    const putTodayUsage = (data: { neuronsEst?: number; costUsdEst?: number }) =>
      prisma.usageDaily.upsert({
        where: { date: new Date(today()) },
        update: data,
        create: { date: new Date(today()), ...data },
      });
    const todayRow = () => prisma.usageDaily.findUnique({ where: { date: new Date(today()) } });
    const sampleRow = () =>
      prisma.sampleResult.findUniqueOrThrow({ where: { scenarioKey: PRESET.key } });

    beforeAll(async () => {
      storageDir = await mkdtemp(join(tmpdir(), 'tome-e2e-usage-'));
      vi.stubEnv('DATABASE_URL', url!);
      vi.stubEnv('AI_PROVIDER', 'mock');
      vi.stubEnv('ADMIN_TOKEN', ADMIN_TOKEN);
      vi.stubEnv('STORAGE_DRIVER', 'local');
      vi.stubEnv('STORAGE_LOCAL_DIR', storageDir);
      const { AppModule } = await import('../src/app.module');
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(AI_PROVIDER)
        .useValue(ai)
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
      // e2e 는 시드 없이 돌므로 필요한 대체 결과를 같은 로더로 적재한다(멱등).
      const storage = app.get<ObjectStorage>(OBJECT_STORAGE, { strict: false });
      expect(await loadSampleResults(prisma, storage)).toBe(PROMPT_PRESETS.length);
    }, 60_000);

    beforeEach(async () => {
      ai.reset();
      await prisma.usageDaily.deleteMany({ where: { date: new Date(today()) } });
      await prisma.appSetting.deleteMany({ where: { key: { in: SETTING_KEYS } } });
    });

    afterAll(async () => {
      if (prisma) {
        await prisma.usageDaily.deleteMany({ where: { date: new Date(today()) } });
        await prisma.appSetting.deleteMany({ where: { key: { in: SETTING_KEYS } } });
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

    describe('admin API', () => {
      it('rejects a missing or wrong admin token', async () => {
        for (const token of [null, 'nope']) {
          const get = await admin('GET', '/admin/usage', undefined, token);
          expect(get.status).toBe(401);
          expect(await errorCode(get)).toBe('ADMIN_TOKEN_INVALID');
          const put = await admin('PUT', '/admin/settings', { dailyNeuronCap: 5 }, token);
          expect(put.status).toBe(401);
          expect(await errorCode(put)).toBe('ADMIN_TOKEN_INVALID');
        }
      });

      it('reports defaults, then the caps that were set', async () => {
        const first = AdminUsageResponseSchema.parse(
          await (await admin('GET', '/admin/usage')).json(),
        );
        expect(first.caps).toEqual({ dailyNeuronCap: 50000, monthlyCostCapUsd: 20 });
        expect(first.today).toMatchObject({ date: today(), textCalls: 0, neuronsEst: 0 });
        expect(first.month.month).toBe(today().slice(0, 7));

        const set = await setCaps({ dailyNeuronCap: 1234 });
        expect(set.settings).toEqual({ dailyNeuronCap: 1234, monthlyCostCapUsd: 20 });
        const both = await setCaps({ dailyNeuronCap: 99, monthlyCostCapUsd: 3.5 });
        expect(both.settings).toEqual({ dailyNeuronCap: 99, monthlyCostCapUsd: 3.5 });
        const usage = AdminUsageResponseSchema.parse(
          await (await admin('GET', '/admin/usage')).json(),
        );
        expect(usage.caps).toEqual({ dailyNeuronCap: 99, monthlyCostCapUsd: 3.5 });
        // 빈 본문은 현재 값을 그대로 돌려준다.
        expect((await setCaps({})).settings).toEqual({
          dailyNeuronCap: 99,
          monthlyCostCapUsd: 3.5,
        });
      });

      it('rejects non-positive or non-numeric caps', async () => {
        for (const body of [
          { dailyNeuronCap: 0 },
          { monthlyCostCapUsd: -1 },
          { dailyNeuronCap: 'x' },
        ]) {
          const res = await admin('PUT', '/admin/settings', body);
          expect(res.status).toBe(400);
          expect(await errorCode(res)).toBe('VALIDATION_FAILED');
        }
      });

      it('GET /me exposes the limit flags', async () => {
        const owner = await newOwner();
        const read = async () =>
          MeResponseSchema.parse(await (await call('GET', '/me', owner.token)).json()).limits;
        expect(await read()).toEqual({ dailyLimitReached: false, budgetReached: false });
        await setCaps({ dailyNeuronCap: 10 });
        await putTodayUsage({ neuronsEst: 10 });
        expect(await read()).toEqual({ dailyLimitReached: true, budgetReached: false });
        await setCaps({ monthlyCostCapUsd: 1 });
        await putTodayUsage({ costUsdEst: 1 });
        expect(await read()).toEqual({ dailyLimitReached: true, budgetReached: true });
      });
    });

    describe('limits on create requests', () => {
      it('blocks POST /sets with DAILY_LIMIT_REACHED and creates no set or job', async () => {
        const owner = await newOwner();
        const { projectId, pageId } = await newEmptyProject(owner);
        await setCaps({ dailyNeuronCap: 100 });
        await putTodayUsage({ neuronsEst: 100 });

        const res = await createSet(owner, projectId, pageId, 'a lighthouse at dusk');
        expect(res.status).toBe(429);
        expect(await errorCode(res)).toBe('DAILY_LIMIT_REACHED');
        expect(await prisma.promptSet.count({ where: { projectId } })).toBe(0);
        expect(await prisma.generationJob.count({ where: { projectId } })).toBe(0);

        // 상한을 올리면 같은 요청이 통과한다(기록이 남지 않았다).
        await setCaps({ dailyNeuronCap: 101 });
        expect((await createSet(owner, projectId, pageId, 'a lighthouse at dusk')).status).toBe(
          201,
        );
      });

      it('blocks POST /sets with BUDGET_REACHED; budget wins when both are reached', async () => {
        const owner = await newOwner();
        const { projectId, pageId } = await newEmptyProject(owner);
        await setCaps({ monthlyCostCapUsd: 1 });
        await putTodayUsage({ costUsdEst: 1 });
        const res = await createSet(owner, projectId, pageId, 'a lighthouse at dusk');
        expect(res.status).toBe(429);
        expect(await errorCode(res)).toBe('BUDGET_REACHED');

        await setCaps({ dailyNeuronCap: 5 });
        await putTodayUsage({ neuronsEst: 5, costUsdEst: 1 });
        expect(await errorCode(await createSet(owner, projectId, pageId, 'x y z'))).toBe(
          'BUDGET_REACHED',
        );
        expect(await prisma.promptSet.count({ where: { projectId } })).toBe(0);
      });

      it('blocks POST /projects with a prompt (no project row) but allows an empty project', async () => {
        const owner = await newOwner();
        await setCaps({ dailyNeuronCap: 100 });
        await putTodayUsage({ neuronsEst: 100 });
        const before = await prisma.project.count({ where: { ownerId: owner.creatorId } });

        const blocked = await createWithPrompt(owner, 'a lighthouse at dusk');
        expect(blocked.status).toBe(429);
        expect(await errorCode(blocked)).toBe('DAILY_LIMIT_REACHED');
        expect(await prisma.project.count({ where: { ownerId: owner.creatorId } })).toBe(before);

        // presetKey 만 보내도 같은 문장이므로 프리셋 규칙을 따른다.
        const empty = await call('POST', '/projects', owner.token, {}, randomUUID());
        expect(empty.status).toBe(201);
      });

      it('lets an unchanged preset sentence through (case/space normalised) but not a changed one', async () => {
        const owner = await newOwner();
        await setCaps({ dailyNeuronCap: 100 });
        await putTodayUsage({ neuronsEst: 100 });

        const messy = `  ${PRESET.prompt.toUpperCase().replace(/ /g, '  ')} `;
        const ok = await createWithPrompt(owner, messy, PRESET.key);
        expect(ok.status).toBe(201);

        const oneOff = await createWithPrompt(owner, `${PRESET.prompt}!`, PRESET.key);
        expect(oneOff.status).toBe(429);
        const noKey = await createWithPrompt(owner, PRESET.prompt);
        expect(noKey.status).toBe(429);
        const onlyKey = await call(
          'POST',
          '/projects',
          owner.token,
          { presetKey: PRESET.key },
          randomUUID(),
        );
        expect(onlyKey.status).toBe(201);
      });
    });

    describe('sample results', () => {
      it('fills a preset job from the sample when the daily cap is reached', async () => {
        const owner = await newOwner();
        await setCaps({ dailyNeuronCap: 100 });
        await putTodayUsage({ neuronsEst: 100 });
        const before = await todayRow();

        const res = await createWithPrompt(owner, PRESET.prompt, PRESET.key);
        expect(res.status).toBe(201);
        const created = CreateProjectResponseSchema.parse(await res.json());
        const jobId = created.job!.id;

        const last = await runStages(owner, jobId, STAGES);
        expect(last.job).toMatchObject({ status: 'succeeded', nextStage: null });
        expect(ai.calls).toEqual({});

        const sample = await sampleRow();
        const answers = await prisma.answer.findMany({ where: { jobId } });
        expect(answers).toHaveLength(1);
        expect(answers[0]).toMatchObject({
          origin: 'sample',
          isSample: true,
          sampleResultId: sample.id,
          imageKey: sample.imageKey,
          thumbKey: sample.thumbKey,
          status: 'accepted',
          number: 1,
          provider: 'sample',
        });
        expect(answers[0]!.verification).not.toBeNull();

        const steps = await prisma.jobStep.findMany({ where: { jobId } });
        expect(steps).toHaveLength(7);
        for (const step of steps) {
          expect(step).toMatchObject({ status: 'succeeded', provider: 'sample', model: 'sample' });
          expect(Number(step.neuronsEst ?? 0)).toBe(0);
        }

        const after = await todayRow();
        expect(after?.textCalls ?? 0).toBe(before?.textCalls ?? 0);
        expect(after?.imageCount ?? 0).toBe(0);
        expect(Number(after?.neuronsEst)).toBe(100);

        const imageStep = last.job.steps.find((s) => s.stage === 'image');
        expect(imageStep?.status).toBe('succeeded');
      });

      it('fills a preset job from the sample when the monthly budget is reached', async () => {
        const owner = await newOwner();
        await setCaps({ monthlyCostCapUsd: 1 });
        await putTodayUsage({ costUsdEst: 1 });
        const created = CreateProjectResponseSchema.parse(
          await (await createWithPrompt(owner, PRESET.prompt, PRESET.key)).json(),
        );
        await runStages(owner, created.job!.id, STAGES);
        const answer = await prisma.answer.findFirstOrThrow({ where: { jobId: created.job!.id } });
        expect(answer).toMatchObject({ isSample: true, origin: 'sample' });
      });

      it('a preset job that hits the cap after the creation request is blocked at advance for a changed prompt', async () => {
        const owner = await newOwner();
        const { projectId, pageId } = await newEmptyProject(owner);
        const created = CreateSetResponseSchema.parse(
          await (await createSet(owner, projectId, pageId, 'a lighthouse at dusk')).json(),
        );
        await runStages(owner, created.job.id, ['analyze', 'research', 'evidence', 'draft']);
        await setCaps({ dailyNeuronCap: 100 });
        await putTodayUsage({ neuronsEst: 100 });

        // assemble 은 AI 를 부르지 않으므로 상한을 확인하지 않는다.
        await advanceOk(owner, created.job.id, 'assemble');
        const res = await advance(owner, created.job.id, 'image');
        expect(res.status).toBe(429);
        expect(await errorCode(res)).toBe('DAILY_LIMIT_REACHED');
        const step = await prisma.jobStep.findUnique({
          where: { jobId_stage: { jobId: created.job.id, stage: 'image' } },
        });
        expect(step).toBeNull();
        expect(await prisma.answer.count({ where: { jobId: created.job.id } })).toBe(0);
      });

      it('replaces the rest of a preset job with the sample when the AI fails', async () => {
        const owner = await newOwner();
        const created = CreateProjectResponseSchema.parse(
          await (await createWithPrompt(owner, PRESET.prompt, PRESET.key)).json(),
        );
        const jobId = created.job!.id;
        ai.failures.research = [new AppError('AI_UNAVAILABLE')];

        await advanceOk(owner, jobId, 'analyze');
        const research = await advanceOk(owner, jobId, 'research');
        expect(research.step).toMatchObject({ status: 'succeeded', provider: 'sample' });
        expect(research.step.nodes?.length).toBeGreaterThan(0);
        await runStages(owner, jobId, STAGES.slice(2));
        expect(ai.calls).toEqual({ analyze: 1, research: 1 });

        const answer = await prisma.answer.findFirstOrThrow({ where: { jobId } });
        expect(answer).toMatchObject({ isSample: true, origin: 'sample' });
        // 이미 나간 호출(analyze 성공, research 실패)만 센다. 대체분은 세지 않는다.
        const row = await todayRow();
        expect(row).toMatchObject({ textCalls: 2, imageCount: 0, fallbackCount: 0 });
      });

      it.each(['AI_TIMEOUT', 'AI_OUTPUT_INVALID'] as const)(
        'falls back to the sample on %s at the image step',
        async (code) => {
          const owner = await newOwner();
          const created = CreateProjectResponseSchema.parse(
            await (await createWithPrompt(owner, PRESET.prompt, PRESET.key)).json(),
          );
          const jobId = created.job!.id;
          ai.failures.image = [new AppError(code)];
          await runStages(owner, jobId, STAGES);
          const answer = await prisma.answer.findFirstOrThrow({ where: { jobId } });
          expect(answer).toMatchObject({ isSample: true, origin: 'sample' });
          // 이미지 호출은 실제로 나갔으므로 1회 센다.
          expect(await todayRow()).toMatchObject({ textCalls: 4, imageCount: 1 });
        },
      );

      it('returns the original error for an arbitrary prompt when the AI fails', async () => {
        const owner = await newOwner();
        const created = CreateProjectResponseSchema.parse(
          await (await createWithPrompt(owner, 'a lighthouse at dusk')).json(),
        );
        ai.failures.analyze = [new AppError('AI_UNAVAILABLE')];
        const res = await advance(owner, created.job!.id, 'analyze');
        expect(res.ok).toBe(false);
        expect(await errorCode(res)).toBe('AI_UNAVAILABLE');
        expect(await prisma.answer.count({ where: { jobId: created.job!.id } })).toBe(0);
      });

      it('returns the original error for a changed preset sentence', async () => {
        const owner = await newOwner();
        const created = CreateProjectResponseSchema.parse(
          await (await createWithPrompt(owner, `${PRESET.prompt} at noon`, PRESET.key)).json(),
        );
        ai.failures.analyze = [new AppError('AI_TIMEOUT')];
        const res = await advance(owner, created.job!.id, 'analyze');
        expect(await errorCode(res)).toBe('AI_TIMEOUT');
      });

      it('never replaces SAFETY_BLOCKED with a sample', async () => {
        const owner = await newOwner();
        const created = CreateProjectResponseSchema.parse(
          await (await createWithPrompt(owner, PRESET.prompt, PRESET.key)).json(),
        );
        ai.failures.analyze = [new AppError('SAFETY_BLOCKED')];
        const res = await advance(owner, created.job!.id, 'analyze');
        expect(await errorCode(res)).toBe('SAFETY_BLOCKED');
        expect(await prisma.answer.count({ where: { jobId: created.job!.id } })).toBe(0);
      });
    });

    describe('usage accounting', () => {
      it('adds up every AI call: one mock run = 4 text calls + 1 image', async () => {
        const owner = await newOwner();
        const created = CreateProjectResponseSchema.parse(
          await (await createWithPrompt(owner, 'a lighthouse at dusk')).json(),
        );
        await runStages(owner, created.job!.id, STAGES);
        const row = await todayRow();
        expect(row).toMatchObject({ textCalls: 4, imageCount: 1, fallbackCount: 0 });
        expect(Number(row!.neuronsEst)).toBe(0);
        // 같은 단계를 다시 불러도(저장된 결과 재생) 다시 세지 않는다.
        await advanceOk(owner, created.job!.id, 'image');
        expect(await todayRow()).toMatchObject({ textCalls: 4, imageCount: 1 });
      });

      it('counts a failed call that was already sent', async () => {
        const owner = await newOwner();
        const created = CreateProjectResponseSchema.parse(
          await (await createWithPrompt(owner, 'a lighthouse at dusk')).json(),
        );
        ai.failures.analyze = [new Error('down')];
        expect((await advance(owner, created.job!.id, 'analyze')).ok).toBe(false);
        expect(await todayRow()).toMatchObject({ textCalls: 1, imageCount: 0 });
      });

      it('does not lose counts when two projects advance at the same time', async () => {
        const [a, b] = [await newOwner(), await newOwner()];
        const [ra, rb] = await Promise.all([
          createWithPrompt(a, 'a lighthouse at dusk'),
          createWithPrompt(b, 'a lighthouse at dawn'),
        ]);
        const jobA = CreateProjectResponseSchema.parse(await ra.json()).job!.id;
        const jobB = CreateProjectResponseSchema.parse(await rb.json()).job!.id;
        for (const stage of STAGES) {
          const results = await Promise.all([advance(a, jobA, stage), advance(b, jobB, stage)]);
          expect(results.map((r) => r.status)).toEqual([200, 200]);
        }
        expect(await todayRow()).toMatchObject({ textCalls: 8, imageCount: 2 });
      });

      it('adds fallback use and neurons (estimated when the header is missing) and recomputes cost', async () => {
        ai.useInner(new CostlyProvider());
        // 하루 무료분(10,000)을 넘기도록 미리 9,990 을 깔아 둔다.
        await putTodayUsage({ neuronsEst: 9990 });
        const owner = await newOwner();
        const created = CreateProjectResponseSchema.parse(
          await (await createWithPrompt(owner, 'a lighthouse at dusk')).json(),
        );
        await runStages(owner, created.job!.id, STAGES);
        const row = await todayRow();
        expect(row).toMatchObject({ textCalls: 4, imageCount: 1, fallbackCount: 5 });
        // 4×100 + schnell 추정 57.6
        expect(Number(row!.neuronsEst)).toBeCloseTo(9990 + 457.6, 3);
        // (10,447.6 − 10,000) × 0.011 / 1,000 = 0.0049236 → 소수 넷째 자리
        expect(Number(row!.costUsdEst)).toBeCloseTo(0.0049, 4);
        const imageStep = await prisma.jobStep.findFirstOrThrow({
          where: { jobId: created.job!.id, stage: 'image' },
        });
        expect(Number(imageStep.neuronsEst)).toBeCloseTo(57.6, 3);
      });
    });
  },
);
