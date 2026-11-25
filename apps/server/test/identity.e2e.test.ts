import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ApiErrorSchema,
  CompareResponseSchema,
  CreateProjectResponseSchema,
  CreateSessionResponseSchema,
  CreatorProfileResponseSchema,
  IdentityResponseSchema,
} from '@tome/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client';
import { LoginRateLimiter } from '../src/modules/session/login-rate-limiter';
import { PrismaService } from '../src/prisma/prisma.service';
import { SEED_CREATORS } from '../prisma/seed/creators';

// 실제 Postgres(마이그레이션 적용 완료)가 있을 때만 돈다. TEST_DATABASE_URL 이 없으면 건너뛴다.
const url = process.env.TEST_DATABASE_URL;

const ADMIN_TOKEN = 'e2e-admin-token-for-tests';

interface Owner {
  creatorId: string;
  token: string;
}

interface Target {
  projectId: string;
  setId: string;
}

describe.skipIf(!url)('identity API (real Postgres)', () => {
  let app: INestApplication;
  let base: string;
  let prisma: PrismaClient;
  const runId = randomUUID();
  const prefix = `e2e-identity-${runId}`;
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

  const newOwner = async (identityPublic = true): Promise<Owner> => {
    const creator = await prisma.creator.create({
      data: { kind: 'persona', displayName: `E2E ${creatorIds.length}`, identityPublic },
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

  const createProject = async (owner: Owner): Promise<Target> => {
    const res = await call(
      'POST',
      '/projects',
      owner.token,
      { prompt: 'A quiet harbor' },
      randomUUID(),
    );
    expect(res.status).toBe(201);
    const body = CreateProjectResponseSchema.parse(await res.json());
    return { projectId: body.project.id, setId: body.set!.id };
  };

  const sendEvents = async (owner: Owner, target: Target, n: number) => {
    const events = Array.from({ length: n }, (_, i) => ({
      id: randomUUID(),
      schemaVersion: 1,
      type: i % 2 === 0 ? 'draft_apply' : 'node_open',
      projectId: target.projectId,
      setId: target.setId,
      clientTs: new Date().toISOString(),
      payload: i % 2 === 0 ? { changed: true, reason: 'because' } : { nodeId: 'e1' },
    }));
    const res = await call('POST', '/events', owner.token, { events });
    expect(res.status).toBe(200);
  };

  const getIdentity = async (viewer: Owner, creatorId: string) => {
    const res = await call('GET', `/creators/${creatorId}/identity`, viewer.token);
    return { status: res.status, json: (await res.json()) as unknown };
  };
  const readIdentity = async (viewer: Owner, creatorId: string) =>
    IdentityResponseSchema.parse((await getIdentity(viewer, creatorId)).json);
  const snapshotRows = (creatorId: string) =>
    prisma.identitySnapshot.count({ where: { creatorId } });

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
      // Creator 삭제로 프로젝트·이벤트·스냅샷이 함께 지워진다.
      await prisma.creator.deleteMany({ where: { id: { in: creatorIds } } });
      await prisma.$disconnect();
    }
    await app?.close();
    vi.unstubAllEnvs();
  });

  it('401 without a token', async () => {
    const res = await call('GET', `/creators/${randomUUID()}/identity`);
    expect(res.status).toBe(401);
  });

  it('404 NOT_FOUND for an unknown creator, 400 for a bad id', async () => {
    const owner = await newOwner();
    const res = await call('GET', `/creators/${randomUUID()}`, owner.token);
    expect(res.status).toBe(404);
    expect(ApiErrorSchema.parse(await res.json()).error.code).toBe('NOT_FOUND');
    expect((await call('GET', '/creators/not-a-uuid/identity', owner.token)).status).toBe(400);
  });

  it('a creator with no events gets all-null axes', async () => {
    const owner = await newOwner();
    const body = await readIdentity(owner, owner.creatorId);
    expect(body.snapshot.axes).toEqual({
      scaleIntensity: null,
      aiRelation: null,
      decisionBasis: null,
      direction: null,
    });
    expect(body.snapshot.metrics.reasonedRatio).toBeNull();
    expect(body.snapshot.metrics.firstRecordedAt).toBeNull();
    expect(body.snapshot.provisional).toBe(true);
    expect(body.table).toHaveLength(4);
    expect(body.table.every((row) => row.score === null)).toBe(true);
  });

  it('computes on first read, reuses it, recomputes after a new event and after deletion', async () => {
    const owner = await newOwner();
    const target = await createProject(owner);
    await sendEvents(owner, target, 24);

    const first = await readIdentity(owner, owner.creatorId);
    expect(await snapshotRows(owner.creatorId)).toBe(1);
    expect(first.snapshot.eventCount).toBe(24);
    expect(first.snapshot.axes.aiRelation).toBe(100);
    expect(first.snapshot.axes.decisionBasis).toBe(100);
    expect(first.snapshot.metrics.reasonedRatio).toBe(1);
    expect(first.snapshot.metrics.originBreakdown.own).toBe(24);
    expect(first.snapshot.projectCount).toBe(1);

    const second = await readIdentity(owner, owner.creatorId);
    expect(second.snapshot.computedAt).toBe(first.snapshot.computedAt);
    expect(await snapshotRows(owner.creatorId)).toBe(1);

    await sendEvents(owner, target, 1);
    const third = await readIdentity(owner, owner.creatorId);
    expect(third.snapshot.eventCount).toBe(25);
    expect(third.snapshot.computedAt).not.toBe(first.snapshot.computedAt);
    expect(await snapshotRows(owner.creatorId)).toBe(2);

    const del = await call('DELETE', `/projects/${target.projectId}`, owner.token);
    expect(del.status).toBe(204);
    const fourth = await readIdentity(owner, owner.creatorId);
    expect(fourth.snapshot.eventCount).toBe(0);
    expect(fourth.snapshot.projectCount).toBe(0);
    expect(fourth.snapshot.axes.aiRelation).toBeNull();
    expect(await snapshotRows(owner.creatorId)).toBe(3);
  });

  it('a server event such as project_finish invalidates the snapshot', async () => {
    const owner = await newOwner();
    const target = await createProject(owner);
    await sendEvents(owner, target, 2);
    await getIdentity(owner, owner.creatorId);
    await prisma.event.create({
      data: {
        id: randomUUID(),
        schemaVersion: 1,
        type: 'project_finish',
        creatorId: owner.creatorId,
        projectId: target.projectId,
        payload: {},
        source: 'server',
      },
    });
    const next = await readIdentity(owner, owner.creatorId);
    expect(next.snapshot.eventCount).toBe(3);
    expect(await snapshotRows(owner.creatorId)).toBe(2);
  });

  it('concurrent first reads produce one snapshot with the same value', async () => {
    const owner = await newOwner();
    const target = await createProject(owner);
    await sendEvents(owner, target, 3);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => getIdentity(owner, owner.creatorId)),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    const computed = new Set(
      results.map((r) => IdentityResponseSchema.parse(r.json).snapshot.computedAt),
    );
    expect(computed.size).toBe(1);
    expect(await snapshotRows(owner.creatorId)).toBe(1);
  });

  it('splits origins into remix and derived by project kind', async () => {
    const owner = await newOwner();
    const partner = await newOwner();
    const plain = await createProject(owner);
    const remix = await createProject(owner);
    await prisma.project.update({
      where: { id: remix.projectId },
      data: { remixPartnerId: partner.creatorId },
    });
    const derived = await createProject(owner);
    await prisma.project.update({ where: { id: derived.projectId }, data: { kind: 'derive' } });
    await sendEvents(owner, plain, 2);
    await sendEvents(owner, remix, 3);
    await sendEvents(owner, derived, 4);
    const body = await readIdentity(owner, owner.creatorId);
    expect(body.snapshot.metrics.originBreakdown).toEqual({ own: 2, remix: 3, derived: 4 });
    expect(body.snapshot.provisional).toBe(false);
  });

  it('private identity: 403 IDENTITY_PRIVATE for others, 200 for the owner', async () => {
    const hidden = await newOwner(false);
    const viewer = await newOwner();
    const denied = await getIdentity(viewer, hidden.creatorId);
    expect(denied.status).toBe(403);
    expect(ApiErrorSchema.parse(denied.json).error.code).toBe('IDENTITY_PRIVATE');
    expect((await getIdentity(hidden, hidden.creatorId)).status).toBe(200);

    const profile = await call('GET', `/creators/${hidden.creatorId}`, viewer.token);
    expect(profile.status).toBe(200);
    expect(CreatorProfileResponseSchema.parse(await profile.json()).identity).toBeNull();
    const own = await call('GET', `/creators/${hidden.creatorId}`, hidden.token);
    expect(CreatorProfileResponseSchema.parse(await own.json()).identity).not.toBeNull();
  });

  it('profile works lists only posted, visible projects', async () => {
    const owner = await newOwner();
    const viewer = await newOwner();
    const posted = await createProject(owner);
    const building = await createProject(owner);
    const removed = await createProject(owner);
    const hiddenOne = await createProject(owner);
    const now = new Date();
    await prisma.project.update({ where: { id: posted.projectId }, data: { postedAt: now } });
    await prisma.project.update({
      where: { id: removed.projectId },
      data: { postedAt: now, deletedAt: now },
    });
    await prisma.project.update({
      where: { id: hiddenOne.projectId },
      data: { postedAt: now, hiddenAt: now },
    });
    for (const token of [viewer.token, owner.token]) {
      const res = await call('GET', `/creators/${owner.creatorId}`, token);
      const body = CreatorProfileResponseSchema.parse(await res.json());
      expect(body.works.map((w) => w.id)).toEqual([posted.projectId]);
      expect(body.works.map((w) => w.id)).not.toContain(building.projectId);
      expect(body.creator.id).toBe(owner.creatorId);
    }
  });

  it('profile reach counts distinct other creators who remixed or derived, newest first', async () => {
    const owner = await newOwner();
    const [first, second, third] = [await newOwner(), await newOwner(), await newOwner()];
    const fresh = await call('GET', `/creators/${owner.creatorId}`, owner.token);
    const empty = CreatorProfileResponseSchema.parse(await fresh.json());
    expect(empty.remixedBy).toEqual({ count: 0, creators: [] });
    expect(empty.derivedBy).toEqual({ count: 0, creators: [] });

    const remixWith = async (who: Owner, minutesAgo: number) => {
      const target = await createProject(who);
      await prisma.project.update({
        where: { id: target.projectId },
        data: {
          remixPartnerId: owner.creatorId,
          createdAt: new Date(Date.now() - minutesAgo * 60_000),
        },
      });
      return target;
    };
    await remixWith(first, 30);
    await remixWith(first, 5); // 같은 사람이 두 번 골라도 한 명으로 센다
    await remixWith(second, 10);
    const removed = await remixWith(third, 1);
    await prisma.project.update({
      where: { id: removed.projectId },
      data: { deletedAt: new Date() },
    });
    await remixWith(owner, 0); // 자기 자신은 세지 않는다

    const original = await createProject(owner);
    const derive = async (who: Owner, hidden = false) => {
      const target = await createProject(who);
      await prisma.project.update({
        where: { id: target.projectId },
        data: {
          kind: 'derive',
          derivedFromProjectId: original.projectId,
          ...(hidden ? { hiddenAt: new Date() } : {}),
        },
      });
    };
    await derive(third);
    await derive(second, true); // 숨긴 파생작은 세지 않는다
    await derive(owner); // 자기 작품을 파생한 것도 세지 않는다

    for (const viewer of [owner, third]) {
      const res = await call('GET', `/creators/${owner.creatorId}`, viewer.token);
      expect(res.status).toBe(200);
      const body = CreatorProfileResponseSchema.parse(await res.json());
      expect(body.remixedBy.count).toBe(2);
      expect(body.remixedBy.creators.map((c) => c.id)).toEqual([first.creatorId, second.creatorId]);
      expect(body.derivedBy.count).toBe(1);
      expect(body.derivedBy.creators.map((c) => c.id)).toEqual([third.creatorId]);
    }
  });

  it('profile reach shows at most 3 creators but counts everyone', async () => {
    const owner = await newOwner();
    for (let i = 0; i < 4; i++) {
      const who = await newOwner();
      const target = await createProject(who);
      await prisma.project.update({
        where: { id: target.projectId },
        data: { remixPartnerId: owner.creatorId },
      });
    }
    const res = await call('GET', `/creators/${owner.creatorId}`, owner.token);
    const body = CreatorProfileResponseSchema.parse(await res.json());
    expect(body.remixedBy.count).toBe(4);
    expect(body.remixedBy.creators).toHaveLength(3);
  });

  it('compare returns me plus public seed creators in seedOrder, without me', async () => {
    const owner = await newOwner();
    const res = await call('GET', '/identity/compare', owner.token);
    expect(res.status).toBe(200);
    const body = CompareResponseSchema.parse(await res.json());
    expect(body.me.creator.id).toBe(owner.creatorId);
    const seeds = await prisma.creator.findMany({
      where: { kind: 'seed', identityPublic: true },
      orderBy: { seedOrder: 'asc' },
      select: { id: true },
    });
    expect(body.others.map((o) => o.creator.id)).toEqual(seeds.map((s) => s.id));
    expect(body.others.length).toBeGreaterThanOrEqual(5);
  });
});
