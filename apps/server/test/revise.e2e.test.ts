import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AcceptAnswerResponseSchema,
  AdvanceJobResponseSchema,
  type Answer,
  ApiErrorSchema,
  CreateProjectResponseSchema,
  CreateRevisionResponseSchema,
  CreateSessionResponseSchema,
  CreateSetResponseSchema,
  GetAnswerResponseSchema,
  GetJobResponseSchema,
  type JobStage,
  type NodeSnapshot,
  VerificationSchema,
  WorkspaceResponseSchema,
} from '@tome/shared';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AI_PROVIDER, type AiProvider, type ImageInput, MockAiProvider } from '../src/ai';
import { PrismaClient } from '../src/generated/prisma/client';
import { LoginRateLimiter } from '../src/modules/session/login-rate-limiter';
import { PrismaService } from '../src/prisma/prisma.service';
import { SEED_CREATORS } from '../prisma/seed/creators';

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

/** mock 을 감싸 호출 횟수·이미지 입력을 기록하는 시험용 공급자. */
class CountingAiProvider implements AiProvider {
  readonly name = 'mock';
  private inner = new MockAiProvider();
  calls: Record<string, number> = {};
  imageInputs: ImageInput[] = [];
  imageDelayMs = 0;

  private count(stage: string) {
    this.calls[stage] = (this.calls[stage] ?? 0) + 1;
  }
  analyze: AiProvider['analyze'] = () => (this.count('analyze'), this.inner.analyze());
  research: AiProvider['research'] = () => (this.count('research'), this.inner.research());
  evidence: AiProvider['evidence'] = () => (this.count('evidence'), this.inner.evidence());
  draft: AiProvider['draft'] = () => (this.count('draft'), this.inner.draft());
  image: AiProvider['image'] = async (input) => {
    this.count('image');
    this.imageInputs.push(input);
    if (this.imageDelayMs) await sleep(this.imageDelayMs);
    return this.inner.image();
  };
  checkInput: AiProvider['checkInput'] = () => this.inner.checkInput();
}

const VerificationResponseSchema = z.object({ verification: VerificationSchema });

interface Owner {
  creatorId: string;
  token: string;
}

describe.skipIf(!url)('revise · accept · pin · verification (real Postgres)', () => {
  let app: INestApplication;
  let base: string;
  let prisma: PrismaClient;
  let storageDir: string;
  const ai = new CountingAiProvider();
  const prefix = `e2e-revise-${randomUUID()}`;
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
      data: { kind: 'persona', displayName: `E2E revise ${creatorIds.length}` },
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
    return { creatorId: creator.id, token: session.token };
  };

  const advance = (owner: Owner, jobId: string, stage: string) =>
    call('POST', `/jobs/${jobId}/advance`, owner.token, { stage });
  const advanceOk = async (owner: Owner, jobId: string, stage: JobStage) => {
    const res = await advance(owner, jobId, stage);
    expect(res.status).toBe(200);
    return AdvanceJobResponseSchema.parse(await res.json());
  };
  const runStages = async (owner: Owner, jobId: string, stages: readonly JobStage[]) => {
    for (const stage of stages) await advanceOk(owner, jobId, stage);
  };
  const getAnswer = async (owner: Owner, id: string): Promise<Answer> => {
    const res = await call('GET', `/answers/${id}`, owner.token);
    expect(res.status).toBe(200);
    return GetAnswerResponseSchema.parse(await res.json()).answer;
  };

  interface Fixture {
    owner: Owner;
    projectId: string;
    setId: string;
    pageId: string;
    answer: Answer;
  }
  /** 프로젝트를 만들어 Answer #1(accepted)까지 끝낸다. */
  const fixture = async (owner?: Owner): Promise<Fixture> => {
    const who = owner ?? (await newOwner());
    const res = await call(
      'POST',
      '/projects',
      who.token,
      { prompt: 'a lighthouse' },
      randomUUID(),
    );
    expect(res.status).toBe(201);
    const created = CreateProjectResponseSchema.parse(await res.json());
    await runStages(who, created.job!.id, STAGES);
    const ws = WorkspaceResponseSchema.parse(
      await (await call('GET', `/projects/${created.project.id}/workspace`, who.token)).json(),
    );
    const set = ws.sets[0]!;
    return {
      owner: who,
      projectId: created.project.id,
      setId: set.id,
      pageId: ws.currentPageId,
      answer: set.latestAnswer!,
    };
  };

  /** 노드를 고친 스냅샷. */
  const editNodes = (
    snapshot: NodeSnapshot,
    edits: Record<string, Record<string, unknown>>,
  ): NodeSnapshot => ({
    ...snapshot,
    nodes: snapshot.nodes.map((n) => (edits[n.id] ? { ...n, ...edits[n.id] } : n)),
  });

  const revise = (f: Fixture, nodes: NodeSnapshot, key: string = randomUUID(), baseId?: string) =>
    call(
      'POST',
      `/sets/${f.setId}/revisions`,
      f.owner.token,
      { baseAnswerId: baseId ?? f.answer.id, nodes },
      key,
    );
  const reviseOk = async (f: Fixture, nodes: NodeSnapshot, baseId?: string) => {
    const res = await revise(f, nodes, randomUUID(), baseId);
    expect(res.status).toBe(201);
    return CreateRevisionResponseSchema.parse(await res.json());
  };
  /** revise → 남은 단계 진행 → draft 답변. */
  const previewOf = async (f: Fixture, nodes: NodeSnapshot, baseId?: string) => {
    const r = await reviseOk(f, nodes, baseId);
    const stages = STAGES.slice(STAGES.indexOf(r.startStage));
    let answerId = '';
    for (const stage of stages) {
      const step = await advanceOk(f.owner, r.job.id, stage);
      if (stage === 'image') answerId = step.step.answer!.id;
    }
    return { revision: r, answer: await getAnswer(f.owner, answerId) };
  };
  const eventCount = (type: string, answerId: string) =>
    prisma.event.count({ where: { type, answerId } });
  const accept = (owner: Owner, id: string, key: string = randomUUID()) =>
    call('POST', `/answers/${id}/accept`, owner.token, undefined, key);

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'tome-e2e-revise-'));
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

  it('a draft made before finishing but accepted after posting stays owner-only (also in the agora)', async () => {
    const f = await fixture();
    const viewer = await newOwner();
    // 완료 전에 미리보기(draft)를 만들어 둔다.
    const draft = await previewOf(f, editNodes(f.answer.nodes, { k1: { weight: 3 } }));
    expect(draft.answer.status).toBe('draft');

    const done = await call(
      'POST',
      `/projects/${f.projectId}/finish`,
      f.owner.token,
      { title: 'Lighthouse', coverAnswerId: f.answer.id },
      randomUUID(),
    );
    expect(done.status).toBe(200);
    const posted = await call('PUT', `/projects/${f.projectId}/post`, f.owner.token, {
      posted: true,
    });
    expect(posted.status).toBe(200);

    // 완료 뒤에 그 draft 를 Apply 한다 → 생성 시각은 완료 전이지만 확정 시각은 완료 뒤.
    await sleep(20);
    expect((await accept(f.owner, draft.answer.id)).status).toBe(200);
    const row = await prisma.answer.findUniqueOrThrow({ where: { id: draft.answer.id } });
    const project = await prisma.project.findUniqueOrThrow({ where: { id: f.projectId } });
    expect(row.createdAt.getTime()).toBeLessThan(project.finishedAt!.getTime());
    expect(row.acceptedAt!.getTime()).toBeGreaterThan(project.finishedAt!.getTime());

    expect((await call('GET', `/answers/${draft.answer.id}`, viewer.token)).status).toBe(404);
    expect((await call('GET', `/answers/${draft.answer.id}`, f.owner.token)).status).toBe(200);
    // 완료 전에 확정된 원래 답변은 공개.
    expect((await call('GET', `/answers/${f.answer.id}`, viewer.token)).status).toBe(200);
    const detail = await call('GET', `/agora/projects/${f.projectId}`, viewer.token);
    expect(detail.status).toBe(200);
    const text = JSON.stringify(await detail.json());
    expect(text).toContain(f.answer.id);
    expect(text).not.toContain(draft.answer.id);
  });

  it('revise → preview → accept makes version 2, and accept spam makes only one version', async () => {
    const f = await fixture();
    const before = { ...ai.calls };
    const res = await revise(f, editNodes(f.answer.nodes, { k1: { weight: 3 } }));
    expect(res.status).toBe(201);
    const r = CreateRevisionResponseSchema.parse(await res.json());
    expect(r.startStage).toBe('assemble');
    expect(r.changes).toEqual([{ nodeId: 'k1', field: 'weight' }]);
    expect(r.job).toMatchObject({
      setId: f.setId,
      status: 'pending',
      startStage: 'assemble',
      nextStage: 'assemble',
      steps: [],
    });

    // 시작 단계 앞 단계는 실행할 수 없다.
    expect(await errorCode(await advance(f.owner, r.job.id, 'analyze'))).toBe('STAGE_OUT_OF_ORDER');
    await runStages(f.owner, r.job.id, ['assemble']);
    const imageStep = await advanceOk(f.owner, r.job.id, 'image');
    await advanceOk(f.owner, r.job.id, 'verify');

    expect(ai.calls['image']).toBe((before['image'] ?? 0) + 1);
    expect(ai.calls['analyze']).toBe(before['analyze']);
    const edit = ai.imageInputs.at(-1)!;
    expect(edit.mode).toBe('edit');
    expect(edit.baseImage?.length).toBeGreaterThan(0);
    expect(edit.editInstruction).toContain('Edit image 0.');

    const draft = await getAnswer(f.owner, imageStep.step.answer!.id);
    expect(draft).toMatchObject({
      status: 'draft',
      number: null,
      origin: 'edited',
      imageMode: 'edit',
      baseAnswerId: f.answer.id,
    });
    expect(draft.nodes.nodes.find((n) => n.id === 'k1')?.weight).toBe(3);
    expect(draft.verification?.status).toBe('skipped');
    const job = GetJobResponseSchema.parse(
      await (await call('GET', `/jobs/${r.job.id}`, f.owner.token)).json(),
    );
    expect(job.job.status).toBe('succeeded');
    expect(job.steps.map((s) => s.stage)).toEqual(['assemble', 'image', 'verify']);

    // 확정 전에는 서가에 보이지 않는다.
    const ws = WorkspaceResponseSchema.parse(
      await (await call('GET', `/projects/${f.projectId}/workspace`, f.owner.token)).json(),
    );
    expect(ws.sets[0]!.answers.map((a) => a.number)).toEqual([1]);

    const imageCalls = ai.calls['image'];
    const key = randomUUID();
    const first = await accept(f.owner, draft.id, key);
    expect(first.status).toBe(200);
    expect(AcceptAnswerResponseSchema.parse(await first.json()).answer).toEqual({
      id: draft.id,
      number: 2,
      status: 'accepted',
    });
    const replay = await accept(f.owner, draft.id, key);
    expect(replay.status).toBe(200);
    expect(AcceptAnswerResponseSchema.parse(await replay.json()).answer.number).toBe(2);
    // 다른 키로 다시 확정하면 이미 확정됐다. 실패·재생에서는 이벤트가 늘지 않는다.
    expect(await errorCode(await accept(f.owner, draft.id))).toBe('NOT_DRAFT');
    expect(await eventCount('version_save', draft.id)).toBe(1);
    const saved = await prisma.event.findFirstOrThrow({
      where: { type: 'version_save', answerId: draft.id },
    });
    expect(saved).toMatchObject({
      creatorId: f.owner.creatorId,
      projectId: f.projectId,
      setId: f.setId,
      source: 'server',
      payload: { number: 2, baseAnswerId: f.answer.id },
    });
    expect(ai.calls['image']).toBe(imageCalls);
    expect(await prisma.answer.count({ where: { setId: f.setId, status: 'accepted' } })).toBe(2);

    // 한 번 더 편집해서 확정 연타(다른 키 동시 3개).
    const second = await previewOf(f, editNodes(draft.nodes, { k2: { weight: 1 } }), draft.id);
    const afterPreview = ai.calls['image'];
    const results = await Promise.all([0, 1, 2].map(() => accept(f.owner, second.answer.id)));
    const statuses = results.map((x) => x.status).sort();
    expect(statuses).toEqual([200, 409, 409]);
    for (const x of results.filter((y) => y.status === 409)) {
      expect(await errorCode(x)).toBe('NOT_DRAFT');
    }
    const ok = results.find((x) => x.status === 200)!;
    expect(AcceptAnswerResponseSchema.parse(await ok.json()).answer.number).toBe(3);
    expect(ai.calls['image']).toBe(afterPreview);
    const numbers = (
      await prisma.answer.findMany({
        where: { setId: f.setId, status: 'accepted' },
        select: { number: true },
        orderBy: { number: 'asc' },
      })
    ).map((a) => a.number);
    expect(numbers).toEqual([1, 2, 3]);
    expect(await eventCount('version_save', second.answer.id)).toBe(1);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: f.projectId } });
    expect(project.lastEditedAt).not.toBeNull();
  });

  it('accept: other owner 403, unknown 404, discarded 409', async () => {
    const f = await fixture();
    const stranger = await newOwner();
    const p = await previewOf(f, editNodes(f.answer.nodes, { k1: { weight: 2 } }));
    expect(await errorCode(await accept(stranger, p.answer.id))).toBe('FORBIDDEN');
    expect(await errorCode(await accept(f.owner, randomUUID()))).toBe('NOT_FOUND');
    // 새 미리보기가 이전 draft 를 밀어낸다.
    const p2 = await previewOf(f, editNodes(f.answer.nodes, { k1: { weight: 1 } }));
    expect((await getAnswer(f.owner, p.answer.id)).status).toBe('discarded');
    expect((await getAnswer(f.owner, p2.answer.id)).status).toBe('draft');
    expect(await errorCode(await accept(f.owner, p.answer.id))).toBe('NOT_DRAFT');
    // 이미 확정된 첫 답변
    expect(await errorCode(await accept(f.owner, f.answer.id))).toBe('NOT_DRAFT');
    expect(await accept(f.owner, p2.answer.id).then((x) => x.status)).toBe(200);
  });

  it('starts at evidence for a dataType change and at draft for an evidence toggle', async () => {
    const f = await fixture();
    const r1 = await reviseOk(f, editNodes(f.answer.nodes, { d1: { enabled: false } }));
    expect(r1.startStage).toBe('evidence');
    expect(r1.changes).toEqual([{ nodeId: 'd1', field: 'enabled' }]);
    const r2 = await reviseOk(f, editNodes(f.answer.nodes, { e1: { enabled: false } }));
    expect(r2.startStage).toBe('draft');
    const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: r2.job.id } });
    expect(job).toMatchObject({ kind: 'revise', baseAnswerId: f.answer.id, startStage: 'draft' });
    expect(
      await prisma.generationJob.findUniqueOrThrow({ where: { id: r1.job.id } }),
    ).toMatchObject({
      status: 'cancelled',
    });
  });

  it('runs the evidence stage with the requested earlier nodes', async () => {
    const f = await fixture();
    const before = { ...ai.calls };
    const r = await reviseOk(f, editNodes(f.answer.nodes, { s1: { order: 1 } }));
    expect(r.startStage).toBe('evidence');
    await runStages(f.owner, r.job.id, ['evidence', 'draft', 'assemble', 'image', 'verify']);
    expect(ai.calls['evidence']).toBe((before['evidence'] ?? 0) + 1);
    expect(ai.calls['draft']).toBe((before['draft'] ?? 0) + 1);
    expect(ai.calls['analyze']).toBe(before['analyze']);
    expect(ai.calls['research']).toBe(before['research']);
  });

  it('rejects no-op, unsupported edits and bad bases without creating anything', async () => {
    const f = await fixture();
    const jobsBefore = await prisma.generationJob.count({ where: { setId: f.setId } });
    const answersBefore = await prisma.answer.count({ where: { setId: f.setId } });

    const noChange = await revise(f, f.answer.nodes);
    expect(noChange.status).toBe(422);
    expect(await errorCode(noChange)).toBe('NO_CHANGES');

    const text = await revise(f, editNodes(f.answer.nodes, { k1: { text: 'tower' } }));
    expect(text.status).toBe(400);
    expect(await errorCode(text)).toBe('VALIDATION_FAILED');

    const removed = await revise(f, {
      ...f.answer.nodes,
      nodes: f.answer.nodes.nodes.slice(1),
    });
    expect(await errorCode(removed)).toBe('VALIDATION_FAILED');

    expect(await errorCode(await revise(f, f.answer.nodes, randomUUID(), randomUUID()))).toBe(
      'NOT_FOUND',
    );

    const stranger = await newOwner();
    const foreign = await call(
      'POST',
      `/sets/${f.setId}/revisions`,
      stranger.token,
      { baseAnswerId: f.answer.id, nodes: editNodes(f.answer.nodes, { k1: { weight: 1 } }) },
      randomUUID(),
    );
    expect(foreign.status).toBe(403);
    const missingSet = await call(
      'POST',
      `/sets/${randomUUID()}/revisions`,
      f.owner.token,
      { baseAnswerId: f.answer.id, nodes: f.answer.nodes },
      randomUUID(),
    );
    expect(missingSet.status).toBe(404);

    // draft 는 base 가 될 수 없다.
    const p = await previewOf(f, editNodes(f.answer.nodes, { k1: { weight: 1 } }));
    const draftBase = await revise(f, p.answer.nodes, randomUUID(), p.answer.id);
    expect(draftBase.status).toBe(400);
    expect(await errorCode(draftBase)).toBe('VALIDATION_FAILED');

    expect(await prisma.generationJob.count({ where: { setId: f.setId } })).toBe(jobsBefore + 1);
    expect(await prisma.answer.count({ where: { setId: f.setId } })).toBe(answersBefore + 1);
  });

  it('a base from another set is 404, and a deleted or hidden project is 404', async () => {
    const f = await fixture();
    const second = await call(
      'POST',
      `/projects/${f.projectId}/sets`,
      f.owner.token,
      { pageId: f.pageId, prompt: 'a bridge' },
      randomUUID(),
    );
    expect(second.status).toBe(201);
    const created = CreateSetResponseSchema.parse(await second.json());
    await runStages(f.owner, created.job.id, STAGES);
    const ws = WorkspaceResponseSchema.parse(
      await (await call('GET', `/projects/${f.projectId}/workspace`, f.owner.token)).json(),
    );
    const other = ws.sets.find((s) => s.id === created.set.id)!.latestAnswer!;
    const res = await revise(
      f,
      editNodes(other.nodes, { k1: { weight: 1 } }),
      randomUUID(),
      other.id,
    );
    expect(res.status).toBe(404);

    const edited = editNodes(f.answer.nodes, { k1: { weight: 1 } });
    await prisma.project.update({ where: { id: f.projectId }, data: { hiddenAt: new Date() } });
    expect((await revise(f, edited)).status).toBe(404);
    expect((await accept(f.owner, f.answer.id)).status).toBe(404);
    await prisma.project.update({
      where: { id: f.projectId },
      data: { hiddenAt: null, deletedAt: new Date() },
    });
    expect((await revise(f, edited)).status).toBe(404);
  });

  it('is idempotent on the key and rejects a different body with the same key', async () => {
    const f = await fixture();
    const nodes = editNodes(f.answer.nodes, { k1: { weight: 2 } });
    const key = randomUUID();
    const a = await revise(f, nodes, key);
    const b = await revise(f, nodes, key);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const ja = CreateRevisionResponseSchema.parse(await a.json());
    const jb = CreateRevisionResponseSchema.parse(await b.json());
    expect(jb.job.id).toBe(ja.job.id);
    expect(await prisma.generationJob.count({ where: { setId: f.setId, kind: 'revise' } })).toBe(1);
    const other = await revise(f, editNodes(f.answer.nodes, { k1: { weight: 1 } }), key);
    expect(other.status).toBe(409);
    expect(await errorCode(other)).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(
      (
        await call('POST', `/sets/${f.setId}/revisions`, f.owner.token, {
          baseAnswerId: f.answer.id,
          nodes,
        })
      ).status,
    ).toBe(400);
  });

  it('cancels the running preview when a new revise arrives', async () => {
    const f = await fixture();
    const a = await reviseOk(f, editNodes(f.answer.nodes, { k1: { weight: 2 } }));
    await advanceOk(f.owner, a.job.id, 'assemble');
    const b = await reviseOk(f, editNodes(f.answer.nodes, { k1: { weight: 1 } }));
    expect(b.job.status).toBe('pending');
    const rows = await prisma.generationJob.findMany({ where: { setId: f.setId, kind: 'revise' } });
    expect(rows.find((j) => j.id === a.job.id)?.status).toBe('cancelled');
    expect(rows.filter((j) => ['pending', 'running'].includes(j.status))).toHaveLength(1);
    expect(await errorCode(await advance(f.owner, a.job.id, 'image'))).toBe('JOB_CLOSED');
    await runStages(f.owner, b.job.id, ['assemble', 'image', 'verify']);
  });

  it('keeps no draft from a job cancelled while its image call is in flight', async () => {
    const f = await fixture();
    const a = await reviseOk(f, editNodes(f.answer.nodes, { k1: { weight: 2 } }));
    await advanceOk(f.owner, a.job.id, 'assemble');
    ai.imageDelayMs = 400;
    try {
      const inFlight = advance(f.owner, a.job.id, 'image');
      await sleep(150);
      const b = await reviseOk(f, editNodes(f.answer.nodes, { k1: { weight: 1 } }));
      await inFlight;
      const fromA = await prisma.answer.findMany({ where: { jobId: a.job.id } });
      expect(fromA.every((x) => x.status === 'discarded')).toBe(true);
      expect(await errorCode(await advance(f.owner, a.job.id, 'verify'))).toBe('JOB_CLOSED');
      ai.imageDelayMs = 0;
      await runStages(f.owner, b.job.id, ['assemble', 'image', 'verify']);
      expect(await prisma.answer.count({ where: { setId: f.setId, status: 'draft' } })).toBe(1);
    } finally {
      ai.imageDelayMs = 0;
    }
  });

  it('keeps one active job when two revises arrive together', async () => {
    const f = await fixture();
    const results = await Promise.all(
      [3, 2].map((weight) => revise(f, editNodes(f.answer.nodes, { k1: { weight } }))),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    const active = await prisma.generationJob.count({
      where: { projectId: f.projectId, status: { in: ['pending', 'running'] } },
    });
    expect(active).toBe(1);
    expect(
      await prisma.generationJob.count({ where: { setId: f.setId, status: 'cancelled' } }),
    ).toBe(1);
  });

  it('refuses a revise while another set of the project is generating', async () => {
    const f = await fixture();
    const second = await call(
      'POST',
      `/projects/${f.projectId}/sets`,
      f.owner.token,
      { pageId: f.pageId, prompt: 'a bridge' },
      randomUUID(),
    );
    expect(second.status).toBe(201);
    const res = await revise(f, editNodes(f.answer.nodes, { k1: { weight: 1 } }));
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('GENERATION_IN_PROGRESS');
  });

  it('reuses the base image without an image call when the edit instruction is empty', async () => {
    const f = await fixture();
    const imageCalls = ai.calls['image'];
    // 7 → 9 는 둘 다 "strongly emphasized" 라 문구가 같다.
    const p = await previewOf(f, editNodes(f.answer.nodes, { k1: { weight: 9 } }));
    expect(ai.calls['image']).toBe(imageCalls);
    expect(p.answer).toMatchObject({
      status: 'draft',
      origin: 'edited',
      imageMode: 'edit',
      baseAnswerId: f.answer.id,
    });
    const rows = await prisma.answer.findMany({
      where: { id: { in: [f.answer.id, p.answer.id] } },
    });
    const baseRow = rows.find((r) => r.id === f.answer.id)!;
    const draftRow = rows.find((r) => r.id === p.answer.id)!;
    expect(draftRow.imageKey).not.toBe(baseRow.imageKey);
    expect(draftRow.editInstruction).toBeNull();
    expect(await readFile(join(storageDir, draftRow.imageKey))).toEqual(
      await readFile(join(storageDir, baseRow.imageKey)),
    );
    expect(draftRow.thumbKey).not.toBe(baseRow.thumbKey);
    expect(await readFile(join(storageDir, draftRow.thumbKey!))).toEqual(
      await readFile(join(storageDir, baseRow.thumbKey!)),
    );
  });

  describe('usage limits', () => {
    const today = () => new Date(new Date().toISOString().slice(0, 10));
    const setCap = (dailyNeuronCap: number) =>
      fetch(`${base}/admin/settings`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
        body: JSON.stringify({ dailyNeuronCap }),
      });
    const reset = async () => {
      await prisma.usageDaily.deleteMany({ where: { date: today() } });
      await prisma.appSetting.deleteMany({ where: { key: 'dailyNeuronCap' } });
    };
    const imageCount = async () =>
      (await prisma.usageDaily.findUnique({ where: { date: today() } }))?.imageCount ?? 0;

    it('refuses a revise at the daily cap without creating a job, and blocks the edit call', async () => {
      const f = await fixture();
      try {
        await reset();
        await prisma.usageDaily.create({ data: { date: today(), neuronsEst: 100 } });
        expect((await setCap(100)).status).toBe(200);
        const jobs = await prisma.generationJob.count({ where: { setId: f.setId } });
        const res = await revise(f, editNodes(f.answer.nodes, { k1: { weight: 3 } }));
        expect(res.status).toBe(429);
        expect(await errorCode(res)).toBe('DAILY_LIMIT_REACHED');
        expect(await prisma.generationJob.count({ where: { setId: f.setId } })).toBe(jobs);

        // 진행 중에 상한에 닿으면 image 단계는 대체 결과 없이 429.
        await reset();
        const r = await reviseOk(f, editNodes(f.answer.nodes, { k1: { weight: 3 } }));
        await advanceOk(f.owner, r.job.id, 'assemble');
        await prisma.usageDaily.create({ data: { date: today(), neuronsEst: 100 } });
        expect((await setCap(100)).status).toBe(200);
        const blocked = await advance(f.owner, r.job.id, 'image');
        expect(blocked.status).toBe(429);
        expect(await errorCode(blocked)).toBe('DAILY_LIMIT_REACHED');
        expect(await prisma.answer.count({ where: { jobId: r.job.id } })).toBe(0);
      } finally {
        await reset();
      }
    });

    it('counts one image for an edit call and none when the instruction is empty', async () => {
      const f = await fixture();
      try {
        await reset();
        const before = ai.calls['image'] ?? 0;
        await previewOf(f, editNodes(f.answer.nodes, { k1: { weight: 3 } }));
        expect(ai.calls['image']).toBe(before + 1);
        expect(await imageCount()).toBe(1);
        // 7 → 9 는 문구가 같아 편집 호출이 없다.
        await previewOf(f, editNodes(f.answer.nodes, { k1: { weight: 9 } }));
        expect(ai.calls['image']).toBe(before + 1);
        expect(await imageCount()).toBe(1);
      } finally {
        await reset();
      }
    });
  });

  it('pins accepted answers only, for the owner only', async () => {
    const f = await fixture();
    const stranger = await newOwner();
    const pin = (owner: Owner, id: string, pinned: boolean) =>
      call('PUT', `/answers/${id}/pin`, owner.token, { pinned });
    const on = await pin(f.owner, f.answer.id, true);
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ pinned: true });
    expect(await (await pin(f.owner, f.answer.id, true)).json()).toEqual({ pinned: true });
    expect((await getAnswer(f.owner, f.answer.id)).pinned).toBe(true);
    expect(await eventCount('pin_toggle', f.answer.id)).toBe(1);
    expect(await (await pin(f.owner, f.answer.id, false)).json()).toEqual({ pinned: false });
    expect(await eventCount('pin_toggle', f.answer.id)).toBe(2);
    const toggles = await prisma.event.findMany({
      where: { type: 'pin_toggle', answerId: f.answer.id },
      orderBy: { serverTs: 'asc' },
    });
    expect(toggles.map((e) => e.payload)).toEqual([{ pinned: true }, { pinned: false }]);
    expect((await pin(stranger, f.answer.id, true)).status).toBe(403);
    expect((await pin(f.owner, randomUUID(), true)).status).toBe(404);
    expect((await call('PUT', `/answers/${f.answer.id}/pin`, f.owner.token, {})).status).toBe(400);

    const p = await previewOf(f, editNodes(f.answer.nodes, { k1: { weight: 1 } }));
    const draftPin = await pin(f.owner, p.answer.id, true);
    expect(draftPin.status).toBe(400);
    expect(await eventCount('pin_toggle', p.answer.id)).toBe(0);
    expect(await errorCode(draftPin)).toBe('VALIDATION_FAILED');
  });

  it('records verification decisions for the owner only', async () => {
    const f = await fixture();
    const stranger = await newOwner();
    const patch = (owner: Owner, id: string, nodes: unknown[]) =>
      call('PATCH', `/answers/${id}/verification`, owner.token, { nodes });
    const res = await patch(f.owner, f.answer.id, [{ id: 'v1', enabled: false }]);
    expect(res.status).toBe(200);
    const { verification } = VerificationResponseSchema.parse(await res.json());
    expect(verification.criteria.find((c) => c.id === 'v1')!.enabled).toBe(false);
    expect(verification.criteria.find((c) => c.id === 'v2')!.enabled).toBe(true);
    const stored = await getAnswer(f.owner, f.answer.id);
    expect(stored.verification?.criteria[0]!.enabled).toBe(false);
    // 결정은 켜짐으로 저장된다.
    const kept = await patch(f.owner, f.answer.id, [{ id: 'v1', decision: 'kept' }]);
    expect(
      VerificationResponseSchema.parse(await kept.json()).verification.criteria[0]!.enabled,
    ).toBe(true);

    const unknown = await patch(f.owner, f.answer.id, [{ id: 'v99', enabled: false }]);
    expect(unknown.status).toBe(400);
    expect(await errorCode(unknown)).toBe('VALIDATION_FAILED');
    expect((await patch(f.owner, f.answer.id, [{ id: 'v1' }])).status).toBe(400);
    expect((await patch(stranger, f.answer.id, [{ id: 'v1', enabled: false }])).status).toBe(403);
    expect((await patch(f.owner, randomUUID(), [{ id: 'v1', enabled: false }])).status).toBe(404);
  });
});
