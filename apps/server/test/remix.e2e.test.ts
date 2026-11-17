import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AdvanceJobResponseSchema,
  ApiErrorSchema,
  ConnectionListResponseSchema,
  CreateProjectResponseSchema,
  CreateRevisionResponseSchema,
  CreateSessionResponseSchema,
  GetAnswerResponseSchema,
  RemixCandidatesResponseSchema,
  SetRemixPartnerResponseSchema,
  WorkspaceResponseSchema,
  type JobStage,
  type NodeSnapshot,
} from '@tome/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

interface Owner {
  creatorId: string;
  token: string;
}

interface Records {
  evidence: number;
  intuitive: number;
  lead: number;
  respect: number;
}

describe.skipIf(!url)('remix API (real Postgres)', () => {
  let app: INestApplication;
  let base: string;
  let prisma: PrismaClient;
  let storageDir: string;
  const prefix = `e2e-remix-${randomUUID()}`;
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

  const newCreator = async (
    kind: 'persona' | 'visitor' = 'persona',
    identityPublic = true,
  ): Promise<Owner> => {
    const creator = await prisma.creator.create({
      data: { kind, displayName: `E2E remix ${creatorIds.length}`, identityPublic },
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

  /** 상대의 기록을 직접 쌓는다(한 시간 전 시각). */
  const addEvents = async (creatorId: string, n: Records) => {
    const mk = (type: string, payload: object) => ({
      id: randomUUID(),
      schemaVersion: 1,
      type,
      creatorId,
      payload,
      serverTs: new Date(Date.now() - 3_600_000),
      source: 'client' as const,
    });
    const rows = [
      ...Array.from({ length: n.evidence }, () => mk('node_open', { nodeId: 'e1' })),
      ...Array.from({ length: n.intuitive }, () => mk('node_open', { nodeId: 'k1' })),
      ...Array.from({ length: n.lead }, () => mk('draft_apply', { changed: true })),
      ...Array.from({ length: n.respect }, () => mk('draft_apply', { changed: false })),
    ];
    await prisma.event.createMany({ data: rows });
  };
  // 기본: 근거 12·직관 2(축 C +71, 12/14), 주도 6·자율 2(축 B +50, 6/8). 이벤트 22개.
  const seedPartner = async (n: Records = { evidence: 12, intuitive: 2, lead: 6, respect: 2 }) => {
    const partner = await newCreator();
    await addEvents(partner.creatorId, n);
    return partner;
  };

  const advanceAll = async (owner: Owner, jobId: string, stages: readonly JobStage[]) => {
    let answerId = '';
    for (const stage of stages) {
      const res = await call('POST', `/jobs/${jobId}/advance`, owner.token, { stage });
      expect(res.status).toBe(200);
      const step = AdvanceJobResponseSchema.parse(await res.json());
      if (stage === 'image') answerId = step.step.answer!.id;
    }
    return answerId;
  };

  interface Fixture {
    owner: Owner;
    projectId: string;
    setId: string;
    answerId: string;
    nodes: NodeSnapshot;
  }
  const fixture = async (owner: Owner): Promise<Fixture> => {
    const res = await call(
      'POST',
      '/projects',
      owner.token,
      { prompt: 'a lighthouse' },
      randomUUID(),
    );
    expect(res.status).toBe(201);
    const created = CreateProjectResponseSchema.parse(await res.json());
    await advanceAll(owner, created.job!.id, STAGES);
    const ws = WorkspaceResponseSchema.parse(
      await (await call('GET', `/projects/${created.project.id}/workspace`, owner.token)).json(),
    );
    const answer = ws.sets[0]!.latestAnswer!;
    return {
      owner,
      projectId: created.project.id,
      setId: ws.sets[0]!.id,
      answerId: answer.id,
      nodes: answer.nodes,
    };
  };
  const setPartner = (f: Fixture, partnerId: string | null) =>
    call('PUT', `/projects/${f.projectId}/remix-partner`, f.owner.token, { partnerId });
  const connections = async (f: Fixture, query = '') => {
    const res = await call('GET', `/answers/${f.answerId}/connections${query}`, f.owner.token);
    expect(res.status).toBe(200);
    return ConnectionListResponseSchema.parse(await res.json()).connections;
  };

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'tome-e2e-remix-'));
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

  it('lists rising candidates by seed order when nothing is posted, excluding ineligible people', async () => {
    const me = await newCreator();
    const visitor = await newCreator('visitor');
    const hidden = await newCreator('persona', false);
    const res = await call('GET', '/remix/candidates?tab=rising', me.token);
    expect(res.status).toBe(200);
    const { creators } = RemixCandidatesResponseSchema.parse(await res.json());
    const ids = creators.map((c) => c.id);
    expect(ids).not.toContain(me.creatorId);
    expect(ids).not.toContain(visitor.creatorId);
    expect(ids).not.toContain(hidden.creatorId);
    expect(ids).toContain(SEED_CREATORS[0]!.id);
    expect(creators.every((c) => c.favorite === false)).toBe(true);
    expect(creators.find((c) => c.id === SEED_CREATORS[0]!.id)?.provisional).toBeTypeOf('boolean');
    expect(await errorCode(await call('GET', '/remix/candidates', me.token))).toBe(
      'VALIDATION_FAILED',
    );
    expect(await errorCode(await call('GET', '/remix/candidates?tab=x', me.token))).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('favorites: PUT/DELETE are idempotent, self is rejected, favorite tab is newest first', async () => {
    const me = await newCreator();
    const a = await newCreator();
    const b = await newCreator();
    const visitor = await newCreator('visitor');
    const fav = (method: string, id: string) => call(method, `/me/favorites/${id}`, me.token);
    expect((await fav('PUT', a.creatorId)).status).toBe(204);
    expect((await fav('PUT', a.creatorId)).status).toBe(204);
    await new Promise((r) => setTimeout(r, 15));
    expect((await fav('PUT', b.creatorId)).status).toBe(204);
    expect((await fav('PUT', visitor.creatorId)).status).toBe(204);
    expect(await prisma.favorite.count({ where: { creatorId: me.creatorId } })).toBe(3);
    expect(await errorCode(await fav('PUT', me.creatorId))).toBe('VALIDATION_FAILED');
    expect(await errorCode(await fav('PUT', randomUUID()))).toBe('NOT_FOUND');

    const list = async () =>
      RemixCandidatesResponseSchema.parse(
        await (await call('GET', '/remix/candidates?tab=favorite', me.token)).json(),
      ).creators;
    const first = await list();
    expect(first.map((c) => c.id)).toEqual([b.creatorId, a.creatorId]); // visitor 제외
    expect(first.every((c) => c.favorite)).toBe(true);
    expect((await fav('DELETE', a.creatorId)).status).toBe(204);
    expect((await fav('DELETE', a.creatorId)).status).toBe(204);
    expect((await list()).map((c) => c.id)).toEqual([b.creatorId]);
  });

  it('sets, validates and clears the remix partner', async () => {
    const me = await newCreator();
    const f = await fixture(me);
    const partner = await seedPartner();
    const res = await setPartner(f, partner.creatorId);
    expect(res.status).toBe(200);
    const body = SetRemixPartnerResponseSchema.parse(await res.json());
    expect(body.remix?.partner.id).toBe(partner.creatorId);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: f.projectId } });
    expect(project.remixPartnerId).toBe(partner.creatorId);
    expect(project.remixPartnerSnapshotId).toBe(body.remix!.snapshotId);
    expect(
      await prisma.event.count({ where: { type: 'remix_partner_select', projectId: f.projectId } }),
    ).toBe(1);

    expect(await errorCode(await setPartner(f, me.creatorId))).toBe('VALIDATION_FAILED');
    expect(await errorCode(await setPartner(f, randomUUID()))).toBe('VALIDATION_FAILED');
    expect(await errorCode(await setPartner(f, (await newCreator('visitor')).creatorId))).toBe(
      'VALIDATION_FAILED',
    );
    expect(
      await errorCode(await setPartner(f, (await newCreator('persona', false)).creatorId)),
    ).toBe('IDENTITY_PRIVATE');
    const other = await newCreator();
    const stranger = await call('PUT', `/projects/${f.projectId}/remix-partner`, other.token, {
      partnerId: partner.creatorId,
    });
    expect(await errorCode(stranger)).toBe('FORBIDDEN');
    const missing = await call('PUT', `/projects/${randomUUID()}/remix-partner`, me.token, {
      partnerId: null,
    });
    expect(await errorCode(missing)).toBe('NOT_FOUND');

    const cleared = await setPartner(f, null);
    expect(SetRemixPartnerResponseSchema.parse(await cleared.json())).toEqual({ remix: null });
    const after = await prisma.project.findUniqueOrThrow({ where: { id: f.projectId } });
    expect([after.remixPartnerId, after.remixPartnerSnapshotId]).toEqual([null, null]);
  });

  it('computes connections from the partner real records, pinned to the snapshot, with a cap of 5', async () => {
    const me = await newCreator();
    const f = await fixture(me);
    const noPartner = await call('GET', `/answers/${f.answerId}/connections`, me.token);
    expect(await errorCode(noPartner)).toBe('NO_PARTNER');

    const partner = await seedPartner();
    await setPartner(f, partner.creatorId);
    const list = await connections(f);
    // 근거 노드 4개(12/14)가 먼저(nodeId 순), 초안 노드(6/8) a1 이 5번째, a2 는 상한으로 빠진다.
    expect(list.map((c) => c.nodeId)).toEqual(['d1', 'e1', 'k1', 'k2', 'a1']);
    expect(list[0]!.sentence).toBe('Leaned on evidence 12 of 14 times');
    expect(list[4]!.sentence).toBe('Took the lead over the AI 6 of 8 times');
    expect(list.every((c) => c.status === 'shown')).toBe(true);
    const rows = await prisma.connection.findMany({ where: { answerId: f.answerId } });
    expect(rows).toHaveLength(5);
    expect(rows.find((r) => r.nodeId === 'e1')).toMatchObject({
      evidenceCount: 12,
      evidenceTotal: 14,
      axis: 'decisionBasis',
      templateKey: 'basis.evidence',
    });

    // 상대 기록이 반대로 쌓이고 스냅샷이 다시 계산돼도(내가 프로필을 열어도) 같은 값이다.
    await addEvents(partner.creatorId, { evidence: 0, intuitive: 30, lead: 0, respect: 20 });
    expect((await call('GET', `/creators/${partner.creatorId}/identity`, me.token)).status).toBe(
      200,
    );
    expect(await prisma.identitySnapshot.count({ where: { creatorId: partner.creatorId } })).toBe(
      2,
    );
    expect(await connections(f)).toEqual(list);
    // 새로 상대를 정한 프로젝트는 새 스냅샷으로 고정되어 값이 달라진다.
    const second = await fixture(me);
    await setPartner(second, partner.creatorId);
    const fresh = await connections(second);
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh[0]!.sentence).not.toBe(list[0]!.sentence);
  });

  it('hides connections when the partner has fewer than 3 manipulations on an axis', async () => {
    const me = await newCreator();
    const f = await fixture(me);
    // 이벤트 22개로 축은 계산되지만 축 B 조작은 2건뿐.
    const partner = await seedPartner({ evidence: 18, intuitive: 2, lead: 2, respect: 0 });
    await setPartner(f, partner.creatorId);
    const list = await connections(f);
    expect(list.map((c) => c.nodeId)).toEqual(['d1', 'e1', 'k1', 'k2']);
  });

  it('is stable under concurrent GETs and never exceeds the cap', async () => {
    const me = await newCreator();
    const f = await fixture(me);
    await setPartner(f, (await seedPartner()).creatorId);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => call('GET', `/answers/${f.answerId}/connections`, me.token)),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    const bodies = await Promise.all(results.map((r) => r.json()));
    for (const b of bodies) expect(b).toEqual(bodies[0]);
    expect(await prisma.connection.count({ where: { answerId: f.answerId } })).toBe(5);
  });

  it('keeps the previous partner connections after switching partners', async () => {
    const me = await newCreator();
    const f = await fixture(me);
    const first = await seedPartner();
    await setPartner(f, first.creatorId);
    const before = await connections(f);
    const second = await seedPartner({ evidence: 2, intuitive: 14, lead: 2, respect: 6 });
    await setPartner(f, second.creatorId);
    const current = await connections(f);
    expect(current.map((c) => c.id)).not.toEqual(before.map((c) => c.id));
    expect(await connections(f, `?partnerId=${first.creatorId}`)).toEqual(before);
    // 현재 상대가 아닌 사람은 새로 계산하지 않는다.
    const stranger = await seedPartner();
    expect(await connections(f, `?partnerId=${stranger.creatorId}`)).toEqual([]);
    expect(await prisma.connection.count({ where: { partnerId: stranger.creatorId } })).toBe(0);
    // 남의 답변은 읽을 수 없다.
    const other = await newCreator();
    expect(
      await errorCode(await call('GET', `/answers/${f.answerId}/connections`, other.token)),
    ).toBe('FORBIDDEN');
    expect(
      await errorCode(await call('GET', `/answers/${randomUUID()}/connections`, me.token)),
    ).toBe('NOT_FOUND');
  });

  it('dismisses idempotently and only for the owner', async () => {
    const me = await newCreator();
    const f = await fixture(me);
    await setPartner(f, (await seedPartner()).creatorId);
    const [target] = await connections(f);
    const other = await newCreator();
    expect(
      await errorCode(await call('POST', `/connections/${target!.id}/dismiss`, other.token)),
    ).toBe('FORBIDDEN');
    expect(
      await errorCode(await call('POST', `/connections/${randomUUID()}/dismiss`, me.token)),
    ).toBe('NOT_FOUND');
    for (let i = 0; i < 2; i += 1) {
      const res = await call('POST', `/connections/${target!.id}/dismiss`, me.token);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'dismissed' });
    }
    expect(
      await prisma.event.count({ where: { type: 'connection_dismiss', answerId: f.answerId } }),
    ).toBe(1);
    // 다시 계산해도 dismissed 는 되돌아오지 않는다.
    expect((await connections(f)).find((c) => c.id === target!.id)?.status).toBe('dismissed');
  });

  it('applies connections when the revised draft is accepted', async () => {
    const me = await newCreator();
    const f = await fixture(me);
    await setPartner(f, (await seedPartner()).creatorId);
    const list = await connections(f);
    const k1 = list.find((c) => c.nodeId === 'k1')!;
    const edited: NodeSnapshot = {
      ...f.nodes,
      nodes: f.nodes.nodes.map((n) => (n.id === 'k1' ? { ...n, weight: 3 } : n)),
    };
    const revise = (ids: string[]) =>
      call(
        'POST',
        `/sets/${f.setId}/revisions`,
        me.token,
        { baseAnswerId: f.answerId, nodes: edited, appliedConnectionIds: ids },
        randomUUID(),
      );

    expect(await errorCode(await revise([randomUUID()]))).toBe('VALIDATION_FAILED');
    // 다른 상대의 Connection 은 쓸 수 없다.
    const snapshot = await prisma.identitySnapshot.findFirstOrThrow();
    const stray = await prisma.connection.create({
      data: {
        answerId: f.answerId,
        nodeId: 'k9',
        partnerId: (await newCreator()).creatorId,
        partnerSnapshotId: snapshot.id,
        predictedAction: 'x',
        templateKey: 'basis.evidence',
        evidenceCount: 1,
        evidenceTotal: 3,
        axis: 'decisionBasis',
      },
    });
    expect(await errorCode(await revise([stray.id]))).toBe('VALIDATION_FAILED');

    const res = await revise([k1.id]);
    expect(res.status).toBe(201);
    const r = CreateRevisionResponseSchema.parse(await res.json());
    const draftId = await advanceAll(me, r.job.id, STAGES.slice(STAGES.indexOf(r.startStage)));
    const draft = GetAnswerResponseSchema.parse(
      await (await call('GET', `/answers/${draftId}`, me.token)).json(),
    ).answer;
    expect(draft.status).toBe('draft');
    expect((await prisma.connection.findUniqueOrThrow({ where: { id: k1.id } })).status).toBe(
      'shown',
    );

    const accepted = await call(
      'POST',
      `/answers/${draftId}/accept`,
      me.token,
      undefined,
      randomUUID(),
    );
    expect(accepted.status).toBe(200);
    expect(await prisma.connection.findUniqueOrThrow({ where: { id: k1.id } })).toMatchObject({
      status: 'applied',
      appliedInAnswerId: draftId,
    });
    expect(
      await prisma.event.count({ where: { type: 'connection_apply', answerId: draftId } }),
    ).toBe(1);
    // applied 는 dismiss 로 바뀌지 않는다.
    const dismiss = await call('POST', `/connections/${k1.id}/dismiss`, me.token);
    expect(await dismiss.json()).toEqual({ status: 'applied' });
  });
});
