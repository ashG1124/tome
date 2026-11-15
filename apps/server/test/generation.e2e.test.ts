import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AdvanceJobResponseSchema,
  ApiErrorSchema,
  CancelJobResponseSchema,
  CreatePageResponseSchema,
  CreateProjectResponseSchema,
  CreateSessionResponseSchema,
  CreateSetResponseSchema,
  GetAnswerResponseSchema,
  GetJobResponseSchema,
  type JobStage,
  LIMITS,
  WorkspaceResponseSchema,
} from '@tome/shared';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AI_PROVIDER, type AiProvider, MockAiProvider, MODELS, WorkersAiProvider } from '../src/ai';
import { AppError } from '../src/common';
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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** mock 을 감싸 호출 횟수를 세고, 지연·예외를 주입하는 시험용 공급자. */
class TestAiProvider implements AiProvider {
  readonly name = 'mock';
  private inner: AiProvider = new MockAiProvider();
  calls: Record<string, number> = {};
  delays: Record<string, number> = {};
  failures: Record<string, Array<Error>> = {};

  /** 시험 동안 실제 공급자 코드(가짜 fetch 주입)로 바꿔 끼운다. reset() 이 mock 으로 되돌린다. */
  useInner(inner: AiProvider): void {
    this.inner = inner;
  }

  reset(): void {
    this.inner = new MockAiProvider();
    this.calls = {};
    this.delays = {};
    this.failures = {};
  }

  private async run<T>(stage: string, fn: () => Promise<T>): Promise<T> {
    this.calls[stage] = (this.calls[stage] ?? 0) + 1;
    const delay = this.delays[stage];
    if (delay) await sleep(delay);
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

interface Owner {
  creatorId: string;
  token: string;
  sessionId: string;
}

describe.skipIf(!url)('generation API (real Postgres)', () => {
  let app: INestApplication;
  let base: string;
  let prisma: PrismaClient;
  let storageDir: string;
  const ai = new TestAiProvider();
  const runId = randomUUID();
  const prefix = `e2e-generation-${runId}`;
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

  /** 프롬프트 없이 만든 빈 프로젝트(Page 0 만 있음)와 그 페이지 id. */
  const newEmptyProject = async (owner: Owner) => {
    const res = await call('POST', '/projects', owner.token, {}, randomUUID());
    expect(res.status).toBe(201);
    const { project } = CreateProjectResponseSchema.parse(await res.json());
    const ws = await workspace(owner, project.id);
    return { projectId: project.id, pageId: ws.currentPageId };
  };
  const workspace = async (owner: Owner, projectId: string, pageId?: string) => {
    const res = await call(
      'GET',
      `/projects/${projectId}/workspace${pageId ? `?pageId=${pageId}` : ''}`,
      owner.token,
    );
    expect(res.status).toBe(200);
    return WorkspaceResponseSchema.parse(await res.json());
  };
  const createSet = (
    owner: Owner,
    projectId: string,
    pageId: string,
    prompt = 'a lighthouse',
    key: string = randomUUID(),
  ) => call('POST', `/projects/${projectId}/sets`, owner.token, { pageId, prompt }, key);
  const createSetOk = async (owner: Owner, projectId: string, pageId: string) => {
    const res = await createSet(owner, projectId, pageId);
    expect(res.status).toBe(201);
    return CreateSetResponseSchema.parse(await res.json());
  };
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
  const cancel = (owner: Owner, jobId: string) =>
    call('POST', `/jobs/${jobId}/cancel`, owner.token);
  /** 세트 만들기 + 끝까지 진행. */
  const generate = async (owner: Owner) => {
    const res = await call(
      'POST',
      '/projects',
      owner.token,
      { prompt: 'a lighthouse' },
      randomUUID(),
    );
    expect(res.status).toBe(201);
    const created = CreateProjectResponseSchema.parse(await res.json());
    await runStages(owner, created.job!.id, STAGES);
    return created;
  };
  const stepRow = (jobId: string, stage: string) =>
    prisma.jobStep.findUniqueOrThrow({ where: { jobId_stage: { jobId, stage } } });

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'tome-e2e-storage-'));
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

  describe('create → advance ×7 → answer → image', () => {
    it('runs the whole pipeline and serves the stored image', async () => {
      ai.reset();
      const owner = await newOwner();
      const res = await call(
        'POST',
        '/projects',
        owner.token,
        { prompt: 'a lighthouse', presetKey: 'sofa' },
        randomUUID(),
      );
      const created = CreateProjectResponseSchema.parse(await res.json());
      const job = created.job!;
      expect(job).toMatchObject({ status: 'pending', nextStage: 'analyze', steps: [] });

      // 중간(research 까지)에서 화면을 닫았다 다시 연 것과 같다.
      const afterResearch = await runStages(owner, job.id, ['analyze', 'research']);
      expect(afterResearch.job).toMatchObject({ status: 'running', nextStage: 'evidence' });
      expect(afterResearch.step.nodes?.length).toBeGreaterThan(0);
      const mid = await workspace(owner, created.project.id);
      expect(mid.activeJob).toMatchObject({
        id: job.id,
        status: 'running',
        nextStage: 'evidence',
        steps: [
          { stage: 'analyze', status: 'succeeded' },
          { stage: 'research', status: 'succeeded' },
        ],
      });
      expect(mid.sets[0]!.latestAnswer).toBeNull();
      expect(mid.pages).toEqual([{ id: mid.currentPageId, index: 0, setCount: 1 }]);

      const last = await runStages(owner, job.id, STAGES.slice(2));
      expect(last.job).toMatchObject({ status: 'succeeded', nextStage: null });
      expect(last.job.steps.map((s) => s.stage)).toEqual(STAGES);
      expect(last.step.verification?.status).toBe('skipped');

      // DB
      const row = await prisma.generationJob.findUniqueOrThrow({
        where: { id: job.id },
        include: { steps: true },
      });
      expect(row.status).toBe('succeeded');
      expect(row.finishedAt).not.toBeNull();
      expect(row.steps.every((s) => s.status === 'succeeded' && s.leaseUntil === null)).toBe(true);
      const assemble = (await stepRow(job.id, 'assemble')).output as { assembledPrompt: string };
      expect(assemble.assembledPrompt).toBe(
        'lighthouse over stormy sea. strongly emphasized lighthouse, dusk light, stormy sea (slightly Textured, slightly Surrounding), rough waves.',
      );
      const answers = await prisma.answer.findMany({ where: { jobId: job.id } });
      expect(answers).toHaveLength(1);
      const stored = answers[0]!;
      expect(row.resultAnswerId).toBe(stored.id);
      expect(stored).toMatchObject({
        status: 'accepted',
        number: 1,
        origin: 'generated',
        imageMode: 'generate',
        imageKey: `answers/${stored.id}/full.png`,
        thumbKey: `answers/${stored.id}/thumb.jpg`,
        isSample: false,
        createdById: owner.creatorId,
        provider: 'mock',
        model: 'mock',
      });
      expect(stored.assembledPrompt).toBe(assemble.assembledPrompt);

      // 이어서 workspace
      const done = await workspace(owner, created.project.id);
      expect(done.activeJob).toBeUndefined();
      expect(done.sets[0]!.latestAnswer?.id).toBe(stored.id);
      expect(done.sets[0]!.answers).toHaveLength(1);
      expect(done.sets[0]!.answers[0]).toMatchObject({ number: 1, thumbUrl: expect.any(String) });
      expect(done.pages[0]!.setCount).toBe(1);

      // GET /answers/:id
      const answerRes = await call('GET', `/answers/${stored.id}`, owner.token);
      expect(answerRes.status).toBe(200);
      const { answer } = GetAnswerResponseSchema.parse(await answerRes.json());
      expect(answer).toMatchObject({
        id: stored.id,
        number: 1,
        status: 'accepted',
        imageUrl: `/assets/answers/${stored.id}/full`,
        thumbUrl: `/assets/answers/${stored.id}/thumb`,
        verification: { status: 'skipped' },
      });
      expect(answer.nodes.subjectTemplate).toBe('{k1} over {k2}');
      expect(answer.nodes.nodes.map((n) => n.id)).toEqual([
        'k1',
        'k2',
        'd1',
        's1',
        'e1',
        'a1',
        'a2',
      ]);
      expect(answer.verification?.criteria.map((c) => c.id)).toEqual(['v1', 'v2']);

      // GET /jobs/:id (재개용)
      const jobRes = await call('GET', `/jobs/${job.id}`, owner.token);
      expect(jobRes.status).toBe(200);
      const jobBody = GetJobResponseSchema.parse(await jobRes.json());
      expect(jobBody.steps.map((s) => s.stage)).toEqual(STAGES);
      expect(jobBody.steps.find((s) => s.stage === 'image')?.answer?.id).toBe(stored.id);

      // 이미지: 302 → 서명 URL → 200 PNG
      const redirect = await fetch(`${base}${answer.imageUrl}`, {
        redirect: 'manual',
        headers: { authorization: `Bearer ${owner.token}` },
      });
      expect(redirect.status).toBe(302);
      const location = redirect.headers.get('location')!;
      expect(location.startsWith('/assets/local/')).toBe(true);
      const image = await fetch(`${base}${location}`);
      expect(image.status).toBe(200);
      expect(image.headers.get('content-type')).toBe('image/png');
      expect(image.headers.get('content-disposition')).toBeNull();
      const bytes = new Uint8Array(await image.arrayBuffer());
      expect(Array.from(bytes.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]);

      const thumb = await fetch(`${base}${answer.thumbUrl}`, {
        redirect: 'follow',
        headers: { authorization: `Bearer ${owner.token}` },
      });
      expect(thumb.status).toBe(200); // 서명 URL 은 상대 경로라 fetch 가 같은 서버로 따라간다.
      expect(thumb.headers.get('content-type')).toBe('image/jpeg');

      const download = await fetch(`${base}${answer.imageUrl}?download=1`, {
        redirect: 'manual',
        headers: { authorization: `Bearer ${owner.token}` },
      });
      expect(download.status).toBe(302);
      const file = await fetch(`${base}${download.headers.get('location')!}`);
      expect(file.status).toBe(200);
      expect(file.headers.get('content-disposition')).toBe(
        'attachment; filename="tome-answer-1.png"',
      );
    }, 20_000); // 첫 썸네일에서 sharp 를 불러오는 시간 포함

    it('rejects asset requests without a token, with a bad id or variant, and bad signed paths', async () => {
      const owner = await newOwner();
      const created = await generate(owner);
      const ws = await workspace(owner, created.project.id);
      const answerId = ws.sets[0]!.latestAnswer!.id;
      expect((await fetch(`${base}/assets/answers/${answerId}/full`)).status).toBe(401);
      const noRedirect = {
        redirect: 'manual',
        headers: { authorization: `Bearer ${owner.token}` },
      } as const;
      expect((await fetch(`${base}/assets/answers/${answerId}/huge`, noRedirect)).status).toBe(404);
      expect((await fetch(`${base}/assets/answers/not-a-uuid/full`, noRedirect)).status).toBe(400);
      expect((await fetch(`${base}/assets/answers/${randomUUID()}/full`, noRedirect)).status).toBe(
        404,
      );
      expect((await fetch(`${base}/assets/local/forged.token`)).status).toBe(404);
    });
  });

  describe('real provider code with an injected fetch', () => {
    const PNG_1PX =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const pad = () => ({
      x: 2,
      y: -1,
      xAxis: ['calm', 'energetic'],
      yAxis: ['dry', 'wet'],
    });
    const STAGE_OUTPUTS: Record<string, unknown> = {
      '1': {
        subject_template: '{k1} over {k2}, {k3}',
        keywords: [
          { id: 'k1', text: 'lighthouse', weight: 8, pad: pad() },
          { id: 'k2', text: 'stormy sea', weight: 5, pad: pad() },
          { id: 'k3', text: 'cliff', weight: 3, pad: pad() },
        ],
      },
      '2': {
        data_types: ['coastal photography'],
        priorities: [
          { id: 's1', text: 'light over form', parent_ids: ['k1'] },
          { id: 's2', text: 'sea texture', parent_ids: ['k2'] },
        ],
      },
      '3': {
        evidence: [
          {
            id: 'e1',
            text: 'Lighthouses are shot at dusk.',
            parent_ids: ['k1'],
            source_type: 'model_knowledge',
          },
          {
            id: 'e2',
            text: 'Storm waves are white-capped.',
            parent_ids: ['k2', 's2'],
            source_type: 'model_knowledge',
          },
        ],
      },
      '4': {
        attributes: [
          { id: 'a1', category: 'lighting', text: 'dusk light', weight: 6, parent_ids: ['e1'] },
          { id: 'a2', category: 'water', text: 'white waves', weight: 4, parent_ids: ['e2'] },
          { id: 'a3', category: 'mood', text: 'moody', weight: 3, parent_ids: ['e2'] },
        ],
      },
    };
    const textBody = (content: unknown) =>
      new Response(
        JSON.stringify({
          success: true,
          result: {
            choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json', 'cf-ai-neurons': '2' } },
      );
    const failure = (status = 500) =>
      new Response(JSON.stringify({ success: false, errors: [{ message: 'boom' }] }), { status });

    interface Script {
      /** 텍스트 호출: 단계 번호·모델 → 응답(undefined 면 정상 출력) */
      text?: (stage: string, model: string) => Response | undefined;
      /** 이미지 호출: 모델 → 응답(undefined 면 정상 이미지) */
      image?: (model: string) => Response | undefined;
      textCalls: Array<{ stage: string; model: string }>;
      imageCalls: string[];
    }

    let jpeg1024: Buffer;
    let script: Script;

    const useFakeWorkersAi = () => {
      script = { textCalls: [], imageCalls: [] };
      const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const model = String(input).split('/ai/run/')[1]!;
        if (init?.body instanceof FormData || model === MODELS.imageFallback) {
          script.imageCalls.push(model);
          const bytes = model === MODELS.imageFallback ? jpeg1024 : Buffer.from(PNG_1PX, 'base64');
          return (
            script.image?.(model) ??
            new Response(
              JSON.stringify({ success: true, result: { image: bytes.toString('base64') } }),
              { status: 200, headers: { 'cf-ai-neurons': '100.5' } },
            )
          );
        }
        const body = JSON.parse(init!.body as string) as { messages: Array<{ content: string }> };
        const stage = /You are stage (\d)/.exec(body.messages[0]!.content)![1]!;
        script.textCalls.push({ stage, model });
        return script.text?.(stage, model) ?? textBody(STAGE_OUTPUTS[stage]);
      }) as typeof fetch;
      ai.useInner(
        new WorkersAiProvider({
          accountId: 'acct',
          apiToken: 'tok',
          fetch: fakeFetch,
          log: () => undefined,
        }),
      );
    };

    const start = async (owner: Owner) => {
      const res = await call(
        'POST',
        '/projects',
        owner.token,
        { prompt: 'a lighthouse' },
        randomUUID(),
      );
      expect(res.status).toBe(201);
      return CreateProjectResponseSchema.parse(await res.json());
    };

    beforeAll(async () => {
      jpeg1024 = await sharp({
        create: { width: 1024, height: 1024, channels: 3, background: 'teal' },
      })
        .jpeg()
        .toBuffer();
    });

    it('records the fallback model when the primary text model fails', async () => {
      ai.reset();
      useFakeWorkersAi();
      script.text = (stage, model) =>
        stage === '1' && model === MODELS.textPrimary ? failure() : undefined;
      const owner = await newOwner();
      const created = await start(owner);
      const jobId = created.job!.id;

      const first = await advanceOk(owner, jobId, 'analyze');
      expect(first.step).toMatchObject({
        stage: 'analyze',
        provider: 'workers-ai',
        fallbackUsed: true,
      });
      expect(script.textCalls.map((c) => c.model)).toEqual([
        MODELS.textPrimary,
        MODELS.textPrimary,
        MODELS.textFallback,
      ]);
      const row = await stepRow(jobId, 'analyze');
      expect(row).toMatchObject({
        provider: 'workers-ai',
        model: MODELS.textFallback,
        fallbackUsed: true,
        attempt: 1,
      });
      expect(Number(row.neuronsEst)).toBe(2);
      expect(first.step.nodes?.map((n) => n.id)).toEqual(['k1', 'k2', 'k3']);
    });

    it('fails only the draft stage on invalid output and keeps the earlier stages', async () => {
      ai.reset();
      useFakeWorkersAi();
      script.text = (stage) => (stage === '4' ? textBody({ attributes: [] }) : undefined);
      const owner = await newOwner();
      const created = await start(owner);
      const jobId = created.job!.id;
      await runStages(owner, jobId, ['analyze', 'research', 'evidence']);

      const bad = await advance(owner, jobId, 'draft');
      expect(bad.status).toBe(502);
      expect(await errorCode(bad)).toBe('AI_OUTPUT_INVALID');
      for (const stage of ['analyze', 'research', 'evidence']) {
        expect((await stepRow(jobId, stage)).status).toBe('succeeded');
      }
      expect(await stepRow(jobId, 'draft')).toMatchObject({
        status: 'failed',
        errorCode: 'AI_OUTPUT_INVALID',
      });

      script.text = undefined;
      const ok = await advanceOk(owner, jobId, 'draft');
      expect(ok.step).toMatchObject({ stage: 'draft', status: 'succeeded', fallbackUsed: false });
      expect(ok.step.nodes?.map((n) => n.id)).toEqual(['a1', 'a2', 'a3']);
      expect(await stepRow(jobId, 'draft')).toMatchObject({ attempt: 2, status: 'succeeded' });
    });

    it('stores a schnell fallback image in its real format with a 512px JPEG thumbnail', async () => {
      ai.reset();
      useFakeWorkersAi();
      script.image = (model) => (model === MODELS.imagePrimary ? failure(503) : undefined);
      const owner = await newOwner();
      const created = await start(owner);
      const jobId = created.job!.id;
      const last = await runStages(owner, jobId, STAGES);
      expect(last.job.status).toBe('succeeded');
      expect(script.imageCalls).toEqual([
        MODELS.imagePrimary,
        MODELS.imagePrimary,
        MODELS.imageFallback,
      ]);

      const image = await stepRow(jobId, 'image');
      expect(image).toMatchObject({
        provider: 'workers-ai',
        model: MODELS.imageFallback,
        fallbackUsed: true,
      });
      expect(Number(image.neuronsEst)).toBe(100.5);
      for (const stage of ['assemble', 'verify']) {
        expect(await stepRow(jobId, stage)).toMatchObject({
          provider: null,
          model: null,
          fallbackUsed: false,
          neuronsEst: null,
        });
      }

      const answer = await prisma.answer.findFirstOrThrow({ where: { jobId } });
      expect(answer).toMatchObject({
        provider: 'workers-ai',
        model: MODELS.imageFallback,
        imageKey: `answers/${answer.id}/full.jpg`,
        thumbKey: `answers/${answer.id}/thumb.jpg`,
      });

      const full = await readFile(join(storageDir, answer.imageKey));
      expect(Buffer.compare(full, jpeg1024)).toBe(0); // 받은 바이트 그대로
      const thumbMeta = await sharp(await readFile(join(storageDir, answer.thumbKey!))).metadata();
      expect(thumbMeta).toMatchObject({ format: 'jpeg', width: 512, height: 512 });

      // 내려받기 파일 이름은 실제 형식을 따른다.
      const download = await fetch(`${base}/assets/answers/${answer.id}/full?download=1`, {
        redirect: 'manual',
        headers: { authorization: `Bearer ${owner.token}` },
      });
      const file = await fetch(`${base}${download.headers.get('location')!}`);
      expect(file.headers.get('content-type')).toBe('image/jpeg');
      expect(file.headers.get('content-disposition')).toBe(
        'attachment; filename="tome-answer-1.jpg"',
      );
    });

    it('maps a stage timeout to 504 and marks only that step failed', async () => {
      ai.reset();
      const owner = await newOwner();
      const created = await start(owner);
      const jobId = created.job!.id;
      ai.useInner(
        new WorkersAiProvider({
          accountId: 'acct',
          apiToken: 'tok',
          stageBudgetMs: 50,
          log: () => undefined,
          fetch: ((_url: string, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) =>
              init?.signal?.addEventListener('abort', () =>
                reject(new DOMException('aborted', 'AbortError')),
              ),
            )) as unknown as typeof fetch,
        }),
      );
      const res = await advance(owner, jobId, 'analyze');
      expect(res.status).toBe(504);
      expect(await errorCode(res)).toBe('AI_TIMEOUT');
      expect((await stepRow(jobId, 'analyze')).status).toBe('failed');
    });
  });

  describe('advance rules', () => {
    it('replays a finished stage without calling the provider again and rejects wrong order', async () => {
      ai.reset();
      const owner = await newOwner();
      const { projectId, pageId } = await newEmptyProject(owner);
      const { job } = await createSetOk(owner, projectId, pageId);

      const out = await advance(owner, job.id, 'research');
      expect(out.status).toBe(409);
      const error = await errorOf(out);
      expect(error.code).toBe('STAGE_OUT_OF_ORDER');
      expect(error.details).toMatchObject({ expected: 'analyze' });

      const first = await advanceOk(owner, job.id, 'analyze');
      const again = await advanceOk(owner, job.id, 'analyze');
      expect(again).toEqual(first);
      expect(ai.calls.analyze).toBe(1);
      expect((await stepRow(job.id, 'analyze')).attempt).toBe(1);

      expect(await errorCode(await advance(owner, job.id, 'draft'))).toBe('STAGE_OUT_OF_ORDER');
      expect((await advance(owner, job.id, 'nope')).status).toBe(400);
    });

    it('answers STEP_IN_PROGRESS to a concurrent request for the same stage', async () => {
      ai.reset();
      const owner = await newOwner();
      const { projectId, pageId } = await newEmptyProject(owner);
      const { job } = await createSetOk(owner, projectId, pageId);
      await advanceOk(owner, job.id, 'analyze');

      ai.delays.research = 700;
      const [a, b] = await Promise.all([
        advance(owner, job.id, 'research'),
        advance(owner, job.id, 'research'),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]);
      const loser = a.status === 409 ? a : b;
      const error = await errorOf(loser);
      expect(error.code).toBe('STEP_IN_PROGRESS');
      expect(error.retryable).toBe(true);
      expect(error.details?.retryAfterMs).toEqual(expect.any(Number));
      expect(ai.calls.research).toBe(1);
      expect((await stepRow(job.id, 'research')).status).toBe('succeeded');
    });

    it('does not take over a live lease but re-runs the stage once the lease has expired', async () => {
      ai.reset();
      const owner = await newOwner();
      const { projectId, pageId } = await newEmptyProject(owner);
      const { job } = await createSetOk(owner, projectId, pageId);
      await advanceOk(owner, job.id, 'analyze');

      // 다른 요청이 research 를 실행 중인 것처럼 만든다(lease 가 남아 있음).
      await prisma.jobStep.create({
        data: {
          jobId: job.id,
          stage: 'research',
          status: 'running',
          attempt: 1,
          leaseUntil: new Date(Date.now() + 30_000),
          startedAt: new Date(),
        },
      });
      const busy = await advance(owner, job.id, 'research');
      expect(busy.status).toBe(409);
      const error = await errorOf(busy);
      expect(error.code).toBe('STEP_IN_PROGRESS');
      expect(error.details?.retryAfterMs as number).toBeGreaterThan(0);
      expect(ai.calls.research ?? 0).toBe(0);

      // 서버가 죽어 lease 가 만료됐다.
      await prisma.jobStep.update({
        where: { jobId_stage: { jobId: job.id, stage: 'research' } },
        data: { leaseUntil: new Date(Date.now() - 1000) },
      });
      const result = await advanceOk(owner, job.id, 'research');
      expect(result.step.status).toBe('succeeded');
      expect(ai.calls.research).toBe(1);
      const row = await stepRow(job.id, 'research');
      expect(row).toMatchObject({ status: 'succeeded', attempt: 2, leaseUntil: null });
    });

    it('keeps running the stage when the client disconnects', async () => {
      ai.reset();
      const owner = await newOwner();
      const { projectId, pageId } = await newEmptyProject(owner);
      const { job } = await createSetOk(owner, projectId, pageId);
      await advanceOk(owner, job.id, 'analyze');

      ai.delays.research = 600;
      const controller = new AbortController();
      const pending = fetch(`${base}/jobs/${job.id}/advance`, {
        method: 'POST',
        headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ stage: 'research' }),
        signal: controller.signal,
      }).catch((error: unknown) => error);
      await sleep(150);
      controller.abort();
      expect(await pending).toBeInstanceOf(Error);

      const deadline = Date.now() + 5000;
      let status = 'running';
      while (Date.now() < deadline && status !== 'succeeded') {
        await sleep(100);
        status = (await stepRow(job.id, 'research')).status;
      }
      expect(status).toBe('succeeded');
      const replay = await advanceOk(owner, job.id, 'research');
      expect(replay.step.status).toBe('succeeded');
      expect(replay.job.nextStage).toBe('evidence');
      expect(ai.calls.research).toBe(1);
    });

    it('turns a provider failure into AI_UNAVAILABLE, keeps earlier steps, and allows a retry', async () => {
      ai.reset();
      const owner = await newOwner();
      const { projectId, pageId } = await newEmptyProject(owner);
      const { job } = await createSetOk(owner, projectId, pageId);
      await advanceOk(owner, job.id, 'analyze');

      ai.failures.research = [new Error('boom with the prompt text inside')];
      const failed = await advance(owner, job.id, 'research');
      expect(failed.status).toBe(503);
      expect(await errorCode(failed)).toBe('AI_UNAVAILABLE');
      expect(await stepRow(job.id, 'research')).toMatchObject({
        status: 'failed',
        errorCode: 'AI_UNAVAILABLE',
        leaseUntil: null,
        attempt: 1,
      });
      expect((await stepRow(job.id, 'analyze')).status).toBe('succeeded');
      const mid = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(mid).toMatchObject({ status: 'running', nextStage: 'research' });

      const retried = await advanceOk(owner, job.id, 'research');
      expect(retried.step.status).toBe('succeeded');
      expect((await stepRow(job.id, 'research')).attempt).toBe(2);
    });

    it('keeps an AppError code from the provider', async () => {
      ai.reset();
      const owner = await newOwner();
      const { projectId, pageId } = await newEmptyProject(owner);
      const { job } = await createSetOk(owner, projectId, pageId);
      ai.failures.analyze = [new AppError('AI_TIMEOUT')];
      const res = await advance(owner, job.id, 'analyze');
      expect(res.status).toBe(504);
      expect(await errorCode(res)).toBe('AI_TIMEOUT');
    });

    it('treats an empty node list as invalid output', async () => {
      ai.reset();
      const owner = await newOwner();
      const { projectId, pageId } = await newEmptyProject(owner);
      const { job } = await createSetOk(owner, projectId, pageId);
      await advanceOk(owner, job.id, 'analyze');
      const original = ai.research;
      ai.research = () =>
        Promise.resolve({ value: [], provider: 'mock', model: 'mock', fallbackUsed: false });
      try {
        expect(await errorCode(await advance(owner, job.id, 'research'))).toBe('AI_OUTPUT_INVALID');
      } finally {
        ai.research = original;
      }
    });

    it('closes the job after the fourth failure of the same stage', async () => {
      ai.reset();
      const owner = await newOwner();
      const { projectId, pageId } = await newEmptyProject(owner);
      const { job } = await createSetOk(owner, projectId, pageId);
      await runStages(owner, job.id, ['analyze', 'research']);

      ai.failures.evidence = Array.from({ length: 4 }, () => new Error('down'));
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        const res = await advance(owner, job.id, 'evidence');
        expect(res.status).toBe(503);
        const row = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
        expect(row.status).toBe(attempt < 4 ? 'running' : 'failed');
      }
      const closed = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(closed).toMatchObject({ status: 'failed', errorCode: 'AI_UNAVAILABLE' });
      expect(closed.finishedAt).not.toBeNull();
      expect((await stepRow(job.id, 'evidence')).attempt).toBe(4);
      expect((await stepRow(job.id, 'research')).status).toBe('succeeded');

      const after = await advance(owner, job.id, 'evidence');
      expect(after.status).toBe(409);
      expect(await errorCode(after)).toBe('JOB_CLOSED');
      // 끝난 단계는 닫힌 job 에서도 저장된 결과를 돌려준다.
      expect((await advanceOk(owner, job.id, 'research')).step.status).toBe('succeeded');
      // 닫힌 job 은 새 세트를 막지 않는다.
      expect((await createSet(owner, projectId, pageId)).status).toBe(201);
    });
  });

  describe('sets', () => {
    it('lets only one of two concurrent set creations through', async () => {
      const owner = await newOwner();
      const { projectId, pageId } = await newEmptyProject(owner);
      const [a, b] = await Promise.all([
        createSet(owner, projectId, pageId, 'one'),
        createSet(owner, projectId, pageId, 'two'),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const loser = a.status === 409 ? a : b;
      expect(await errorCode(loser)).toBe('GENERATION_IN_PROGRESS');
      const jobs = await prisma.generationJob.findMany({ where: { projectId } });
      expect(jobs).toHaveLength(1);
      expect(['pending', 'running']).toContain(jobs[0]!.status);
      expect(await prisma.promptSet.count({ where: { projectId } })).toBe(1);
    });

    it('rejects a set while a job is running, then allows the 3rd set and refuses the 4th', async () => {
      const owner = await newOwner();
      const { projectId, pageId } = await newEmptyProject(owner);
      const first = await createSetOk(owner, projectId, pageId);
      expect(first.set).toMatchObject({ position: 1, latestAnswer: null, answers: [] });
      expect(first.job).toMatchObject({ status: 'pending', nextStage: 'analyze', steps: [] });
      expect(await errorCode(await createSet(owner, projectId, pageId))).toBe(
        'GENERATION_IN_PROGRESS',
      );
      expect((await cancel(owner, first.job.id)).status).toBe(200);
      const second = await createSetOk(owner, projectId, pageId);
      await cancel(owner, second.job.id);
      const third = await createSetOk(owner, projectId, pageId);
      expect([first.set.position, second.set.position, third.set.position]).toEqual([1, 2, 3]);
      await cancel(owner, third.job.id);

      const fourth = await createSet(owner, projectId, pageId);
      expect(fourth.status).toBe(409);
      expect(await errorCode(fourth)).toBe('SET_LIMIT_REACHED');
      expect(await prisma.promptSet.count({ where: { pageId } })).toBe(LIMITS.SETS_PER_PAGE);
      const ws = await workspace(owner, projectId);
      expect(ws.pages[0]!.setCount).toBe(3);
      expect(ws.sets.map((s) => s.position)).toEqual([1, 2, 3]);
    });

    it('validates the body and the page', async () => {
      const owner = await newOwner();
      const a = await newEmptyProject(owner);
      const b = await newEmptyProject(owner);
      const withAttachment = await call(
        'POST',
        `/projects/${a.projectId}/sets`,
        owner.token,
        { pageId: a.pageId, prompt: 'x', attachmentId: randomUUID() },
        randomUUID(),
      );
      expect(withAttachment.status).toBe(400);
      const error = await errorOf(withAttachment);
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(error.details)).toContain('attachmentId');

      // 다른 프로젝트의 페이지
      expect(await errorCode(await createSet(owner, a.projectId, b.pageId))).toBe('NOT_FOUND');
      expect((await createSet(owner, a.projectId, a.pageId, '')).status).toBe(400);
      expect((await createSet(owner, a.projectId, a.pageId, 'x'.repeat(501))).status).toBe(400);
      expect(
        (
          await call('POST', `/projects/${a.projectId}/sets`, owner.token, {
            pageId: a.pageId,
            prompt: 'x',
          })
        ).status,
      ).toBe(400); // Idempotency-Key 없음
      expect(await prisma.generationJob.count({ where: { projectId: a.projectId } })).toBe(0);
    });

    it('stores presetKey, replays the same key, and counts creation as an edit', async () => {
      const owner = await newOwner();
      const { projectId, pageId } = await newEmptyProject(owner);
      const before = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      const key = randomUUID();
      const body = { pageId, prompt: 'a sofa', presetKey: 'sofa' };
      const first = await call('POST', `/projects/${projectId}/sets`, owner.token, body, key);
      const second = await call('POST', `/projects/${projectId}/sets`, owner.token, body, key);
      expect([first.status, second.status]).toEqual([201, 201]);
      const a = CreateSetResponseSchema.parse(await first.json());
      const b = CreateSetResponseSchema.parse(await second.json());
      expect(b).toEqual(a);
      const rows = await prisma.promptSet.findMany({ where: { projectId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.presetKey).toBe('sofa');
      const after = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      expect(after.lastEditedAt.getTime()).toBeGreaterThan(before.lastEditedAt.getTime());
      // 같은 키 + 다른 본문
      const other = await call(
        'POST',
        `/projects/${projectId}/sets`,
        owner.token,
        { pageId, prompt: 'different' },
        key,
      );
      expect(await errorCode(other)).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('answers 409 IDEMPOTENCY_KEY_REUSED, not 500, when a 24h-old key is reused', async () => {
      const owner = await newOwner();
      const { projectId, pageId } = await newEmptyProject(owner);
      const key = randomUUID();
      const first = await createSet(owner, projectId, pageId, 'a lighthouse', key);
      expect(first.status).toBe(201);
      const { job } = CreateSetResponseSchema.parse(await first.json());
      await cancel(owner, job.id);
      await prisma.idempotencyRecord.updateMany({
        where: { sessionId: owner.sessionId, key },
        data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
      });
      const again = await createSet(owner, projectId, pageId, 'a lighthouse', key);
      expect(again.status).toBe(409);
      expect(await errorCode(again)).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await prisma.generationJob.count({ where: { projectId } })).toBe(1);
      expect(await prisma.promptSet.count({ where: { projectId } })).toBe(1);
    });
  });

  describe('pages', () => {
    it('adds pages up to 10, then 409 PAGE_LIMIT_REACHED', async () => {
      const owner = await newOwner();
      const { projectId } = await newEmptyProject(owner);
      for (let index = 1; index < LIMITS.PAGES_MAX; index += 1) {
        const res = await call(
          'POST',
          `/projects/${projectId}/pages`,
          owner.token,
          undefined,
          randomUUID(),
        );
        expect(res.status).toBe(201);
        expect(CreatePageResponseSchema.parse(await res.json()).page.index).toBe(index);
      }
      const eleventh = await call(
        'POST',
        `/projects/${projectId}/pages`,
        owner.token,
        undefined,
        randomUUID(),
      );
      expect(eleventh.status).toBe(409);
      expect(await errorCode(eleventh)).toBe('PAGE_LIMIT_REACHED');
      expect(await prisma.page.count({ where: { projectId } })).toBe(LIMITS.PAGES_MAX);

      const ws = await workspace(owner, projectId);
      expect(ws.pages.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(ws.currentPageId).toBe(ws.pages[9]!.id); // pageId 생략 = 마지막 페이지
      const first = await workspace(owner, projectId, ws.pages[0]!.id);
      expect(first.currentPageId).toBe(ws.pages[0]!.id);
    });

    it('replays the same key with the same page, and serializes concurrent requests', async () => {
      const owner = await newOwner();
      const { projectId } = await newEmptyProject(owner);
      const key = randomUUID();
      const a = await call('POST', `/projects/${projectId}/pages`, owner.token, undefined, key);
      const b = await call('POST', `/projects/${projectId}/pages`, owner.token, undefined, key);
      expect([a.status, b.status]).toEqual([201, 201]);
      const pageA = CreatePageResponseSchema.parse(await a.json()).page;
      expect(CreatePageResponseSchema.parse(await b.json()).page).toEqual(pageA);
      expect(await prisma.page.count({ where: { projectId } })).toBe(2);

      const results = await Promise.all(
        [1, 2, 3, 4].map(() =>
          call('POST', `/projects/${projectId}/pages`, owner.token, undefined, randomUUID()),
        ),
      );
      expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
      const indexes = await prisma.page.findMany({
        where: { projectId },
        orderBy: { index: 'asc' },
        select: { index: true },
      });
      expect(indexes.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('rejects an unknown or foreign pageId on the workspace', async () => {
      const owner = await newOwner();
      const a = await newEmptyProject(owner);
      const b = await newEmptyProject(owner);
      const res = await call(
        'GET',
        `/projects/${a.projectId}/workspace?pageId=${b.pageId}`,
        owner.token,
      );
      expect(res.status).toBe(404);
      expect(await errorCode(res)).toBe('NOT_FOUND');
      expect(
        (await call('GET', `/projects/${a.projectId}/workspace?pageId=nope`, owner.token)).status,
      ).toBe(400);
      expect((await call('GET', '/projects/nope/workspace', owner.token)).status).toBe(400);
    });
  });

  describe('cancel', () => {
    it('cancels, is idempotent, refuses finished jobs, and frees the project', async () => {
      ai.reset();
      const owner = await newOwner();
      const { projectId, pageId } = await newEmptyProject(owner);
      const { job } = await createSetOk(owner, projectId, pageId);
      await advanceOk(owner, job.id, 'analyze');

      const res = await cancel(owner, job.id);
      expect(res.status).toBe(200);
      expect(CancelJobResponseSchema.parse(await res.json()).job).toMatchObject({
        id: job.id,
        status: 'cancelled',
        steps: [{ stage: 'analyze', status: 'succeeded' }],
      });
      const row = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(row.status).toBe('cancelled');
      expect(row.finishedAt).not.toBeNull();
      expect((await cancel(owner, job.id)).status).toBe(200);

      // 취소 뒤 advance 는 닫힘, 끝난 단계 재생은 예외
      expect(await errorCode(await advance(owner, job.id, 'research'))).toBe('JOB_CLOSED');
      expect((await advanceOk(owner, job.id, 'analyze')).job.status).toBe('cancelled');
      expect((await workspace(owner, projectId)).activeJob).toBeUndefined();
      expect((await createSet(owner, projectId, pageId)).status).toBe(201);

      const finished = await generate(owner);
      const done = await cancel(owner, finished.job!.id);
      expect(done.status).toBe(409);
      expect(await errorCode(done)).toBe('JOB_CLOSED');
    });

    it('does not let a running stage revive a job cancelled in the meantime', async () => {
      ai.reset();
      const owner = await newOwner();
      const { projectId, pageId } = await newEmptyProject(owner);
      const { job } = await createSetOk(owner, projectId, pageId);
      ai.delays.analyze = 500;
      const running = advance(owner, job.id, 'analyze');
      await sleep(150);
      expect((await cancel(owner, job.id)).status).toBe(200);
      expect((await running).status).toBe(200);
      const row = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(row).toMatchObject({ status: 'cancelled', nextStage: 'analyze' });
      expect((await stepRow(job.id, 'analyze')).status).toBe('succeeded');
    });
  });

  describe('permissions', () => {
    it('answers 403 for other people’s workspace, pages and sets, and hides jobs and answers', async () => {
      ai.reset();
      const alice = await newOwner();
      const bob = await newOwner();
      const created = await generate(alice);
      const ws = await workspace(alice, created.project.id);
      const answerId = ws.sets[0]!.latestAnswer!.id;
      const jobId = created.job!.id;

      const forbidden = [
        await call('GET', `/projects/${created.project.id}/workspace`, bob.token),
        await call(
          'POST',
          `/projects/${created.project.id}/pages`,
          bob.token,
          undefined,
          randomUUID(),
        ),
        await createSet(bob, created.project.id, ws.currentPageId),
      ];
      for (const res of forbidden) {
        expect(res.status).toBe(403);
        expect(await errorCode(res)).toBe('FORBIDDEN');
      }
      expect(await prisma.page.count({ where: { projectId: created.project.id } })).toBe(1);

      for (const res of [
        await call('GET', `/jobs/${jobId}`, bob.token),
        await advance(bob, jobId, 'analyze'),
        await cancel(bob, jobId),
        await call('GET', `/answers/${answerId}`, bob.token),
        await fetch(`${base}/assets/answers/${answerId}/full`, {
          redirect: 'manual',
          headers: { authorization: `Bearer ${bob.token}` },
        }),
      ]) {
        expect(res.status).toBe(404);
      }

      // 게시된 프로젝트의 답변은 남도 읽을 수 있다(job 은 여전히 소유자만).
      await prisma.project.update({
        where: { id: created.project.id },
        data: { postedAt: new Date() },
      });
      const read = await call('GET', `/answers/${answerId}`, bob.token);
      expect(read.status).toBe(200);
      expect(GetAnswerResponseSchema.parse(await read.json()).answer.id).toBe(answerId);
      const asset = await fetch(`${base}/assets/answers/${answerId}/thumb`, {
        redirect: 'manual',
        headers: { authorization: `Bearer ${bob.token}` },
      });
      expect(asset.status).toBe(302);
      expect((await call('GET', `/jobs/${jobId}`, bob.token)).status).toBe(404);

      // 게시돼 있어도 삭제·숨김이면 404
      await prisma.project.update({
        where: { id: created.project.id },
        data: { hiddenAt: new Date() },
      });
      expect((await call('GET', `/answers/${answerId}`, bob.token)).status).toBe(404);
      expect((await call('GET', `/answers/${answerId}`, alice.token)).status).toBe(404);
    });

    it('answers 404 for deleted or hidden projects, even for the owner', async () => {
      const owner = await newOwner();
      const deleted = await newEmptyProject(owner);
      const hidden = await newEmptyProject(owner);
      const { job } = await createSetOk(owner, hidden.projectId, hidden.pageId);
      await prisma.project.update({
        where: { id: deleted.projectId },
        data: { deletedAt: new Date() },
      });
      await prisma.project.update({
        where: { id: hidden.projectId },
        data: { hiddenAt: new Date() },
      });
      for (const projectId of [deleted.projectId, hidden.projectId]) {
        expect((await call('GET', `/projects/${projectId}/workspace`, owner.token)).status).toBe(
          404,
        );
        expect(
          (await call('POST', `/projects/${projectId}/pages`, owner.token, undefined, randomUUID()))
            .status,
        ).toBe(404);
      }
      expect((await createSet(owner, deleted.projectId, deleted.pageId)).status).toBe(404);
      expect((await advance(owner, job.id, 'analyze')).status).toBe(404);
      expect((await call('GET', `/jobs/${job.id}`, owner.token)).status).toBe(404);
      expect((await cancel(owner, job.id)).status).toBe(404);
      expect((await call('GET', `/projects/${randomUUID()}/workspace`, owner.token)).status).toBe(
        404,
      );
    });

    it('requires a token on every route', async () => {
      const id = randomUUID();
      for (const [method, path] of [
        ['GET', `/projects/${id}/workspace`],
        ['POST', `/projects/${id}/pages`],
        ['POST', `/projects/${id}/sets`],
        ['POST', `/jobs/${id}/advance`],
        ['GET', `/jobs/${id}`],
        ['POST', `/jobs/${id}/cancel`],
        ['GET', `/answers/${id}`],
        ['GET', `/assets/answers/${id}/full`],
      ] as const) {
        expect((await call(method, path)).status, `${method} ${path}`).toBe(401);
      }
    });
  });
});
