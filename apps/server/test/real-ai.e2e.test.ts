import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AdvanceJobResponseSchema,
  CreateProjectResponseSchema,
  CreateSessionResponseSchema,
  type JobStage,
} from '@tome/shared';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client';
import { LoginRateLimiter } from '../src/modules/session/login-rate-limiter';
import { PrismaService } from '../src/prisma/prisma.service';
import { SEED_CREATORS } from '../prisma/seed/creators';

// 실제 Workers AI 를 부르는 통합 테스트(비용 발생). 기본 `pnpm test` 에서는 건너뛴다.
// 실행: REAL_AI_E2E=1 TEST_DATABASE_URL=... WORKERS_AI_ACCOUNT_ID=... WORKERS_AI_API_TOKEN=... pnpm --filter @tome/server exec vitest run test/real-ai.e2e.test.ts
const enabled = Boolean(process.env.REAL_AI_E2E) && Boolean(process.env.TEST_DATABASE_URL);
const url = process.env.TEST_DATABASE_URL;

const ADMIN_TOKEN = 'real-ai-e2e-admin-token';
const STAGES: JobStage[] = [
  'analyze',
  'research',
  'evidence',
  'draft',
  'assemble',
  'image',
  'verify',
];

describe.skipIf(!enabled)('real Workers AI pipeline', () => {
  let app: INestApplication;
  let base: string;
  let prisma: PrismaClient;
  let storageDir: string;
  let creatorId = '';
  let token = '';
  let sessionId = '';
  const prefix = `real-ai-${randomUUID()}`;

  const call = (method: string, path: string, body?: unknown, key?: string) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(key ? { 'idempotency-key': key } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'tome-real-ai-'));
    vi.stubEnv('DATABASE_URL', url!);
    vi.stubEnv('AI_PROVIDER', 'workers-ai'); // 키는 이미 환경변수에 있어야 한다
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

    const creator = await prisma.creator.create({
      data: { kind: 'persona', displayName: 'Real AI E2E' },
    });
    creatorId = creator.id;
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
    token = session.token;
    await prisma.accessCode.updateMany({ where: { creatorId }, data: { active: false } });
    const consent = await call('POST', '/session/consent', {
      noticeVersion: session.noticeVersion,
    });
    expect(consent.status).toBe(200);
    sessionId = (
      await prisma.demoSession.findFirstOrThrow({ where: { creatorId }, select: { id: true } })
    ).id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.idempotencyRecord.deleteMany({ where: { sessionId } });
      await prisma.demoSession.deleteMany({ where: { creatorId } });
      await prisma.accessCode.deleteMany({ where: { creatorId } });
      await prisma.creator.deleteMany({ where: { id: creatorId } });
      await prisma.$disconnect();
    }
    await app?.close();
    vi.unstubAllEnvs();
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
  });

  it('runs one set through all seven steps and stores a JPEG answer', async () => {
    const created = CreateProjectResponseSchema.parse(
      await (
        await call(
          'POST',
          '/projects',
          { prompt: 'a small red fishing boat at dawn on a calm lake, no text' },
          randomUUID(),
        )
      ).json(),
    );
    const jobId = created.job!.id;

    for (const stage of STAGES) {
      const res = await call('POST', `/jobs/${jobId}/advance`, { stage });
      expect(res.status, `stage ${stage}`).toBe(200);
      AdvanceJobResponseSchema.parse(await res.json());
    }

    const job = await prisma.generationJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { steps: true },
    });
    expect(job.status).toBe('succeeded');

    // 프롬프트·응답 원문 없이 단계별 수치만 출력한다.
    const rows = STAGES.map((stage) => {
      const s = job.steps.find((x) => x.stage === stage)!;
      return {
        stage,
        provider: s.provider,
        model: s.model,
        fallbackUsed: s.fallbackUsed,
        latencyMs: s.latencyMs,
        neuronsEst: s.neuronsEst === null ? null : Number(s.neuronsEst),
      };
    });
    console.table(rows);
    const total = rows.reduce((sum, r) => sum + (r.neuronsEst ?? 0), 0);
    console.log(`neurons total: ${total.toFixed(2)}`);

    const answer = await prisma.answer.findFirstOrThrow({ where: { jobId } });
    const full = await readFile(join(storageDir, answer.imageKey));
    const fullMeta = await sharp(full).metadata();
    expect(fullMeta).toMatchObject({ format: 'jpeg', width: 1024, height: 1024 });
    const thumbMeta = await sharp(await readFile(join(storageDir, answer.thumbKey!))).metadata();
    expect(thumbMeta).toMatchObject({ format: 'jpeg', width: 512, height: 512 });

    const verify = (job.steps.find((s) => s.stage === 'verify')!.output ?? {}) as {
      verification?: { status?: string };
    };
    expect(verify.verification?.status).toBe('skipped');
  }, 120_000);
});
