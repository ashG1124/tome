import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UpdateVerificationResponseSchema,
  CreateNodeCommentResponseSchema,
  type Answer,
  type Job,
} from '@tome/shared';
import { api, apiConfig, clearSession, newIdempotencyKey, request, setSession } from './index';
import { resetFake } from './fake/state';
import { dropFakeStoreMemory, fakeStore, saveFakeStore } from './fake/store';
import { FAKE_AGORA_IDS } from './fake/agora';
import { FAKE_OTHER_CREATORS } from './fake/identity';

const originalConfig = { ...apiConfig };
beforeEach(async () => {
  localStorage.clear();
  clearSession();
  resetFake();
  Object.assign(apiConfig, { mode: 'fake', fakeDelayMs: 0, fakeError: null });
  const session = await api.createSession('code');
  setSession(session.token, session.noticeVersion);
  await api.consent(session.noticeVersion);
});
afterEach(() => {
  Object.assign(apiConfig, originalConfig);
  vi.unstubAllGlobals();
});

async function finish(initial: Job): Promise<Answer> {
  let job = initial;
  while (job.nextStage) job = (await api.advanceJob(job.id, job.nextStage)).job;
  const result = await api.getJob(job.id);
  return result.steps.find((step) => step.answer)?.answer as Answer;
}
async function setup() {
  const created = await api.createProject({ prompt: 'A lighthouse beside a stormy sea' });
  const answer = await finish(created.job!);
  return { answer, projectId: created.project.id, setId: created.set!.id };
}

describe('answer history API', () => {
  it('persists pin changes in detail, workspace, job and finish candidates', async () => {
    const { answer, projectId } = await setup();
    expect(await api.getAnswer(answer.id)).toEqual({ answer });
    expect(await api.pinAnswer(answer.id, true)).toEqual({ pinned: true });
    expect(await api.pinAnswer(answer.id, true)).toEqual({ pinned: true });
    dropFakeStoreMemory();
    expect((await api.getAnswer(answer.id)).answer.pinned).toBe(true);
    const workspace = await api.getWorkspace(projectId);
    expect(workspace.sets[0]?.answers[0]?.pinned).toBe(true);
    expect(workspace.sets[0]?.latestAnswer?.pinned).toBe(true);
    expect((await api.getFinishCandidates(projectId)).answers).toEqual([
      expect.objectContaining({ id: answer.id, pinned: true }),
    ]);
    await api.pinAnswer(answer.id, false);
    dropFakeStoreMemory();
    expect((await api.getAnswer(answer.id)).answer.pinned).toBe(false);
  });

  it('accepts comments on verification criteria, not on mismatches', async () => {
    const { answer } = await setup();
    const criterion = answer.verification?.criteria[0];
    const mismatch = answer.verification?.mismatches[0];
    expect(criterion).toBeDefined();
    const result = await api.createNodeComment(answer.id, {
      nodeId: criterion!.id,
      body: 'Criterion reason',
    });
    expect(result.comment.nodeId).toBe(criterion!.id);
    if (mismatch)
      await expect(
        api.createNodeComment(answer.id, { nodeId: mismatch.id, body: 'x' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('persists trimmed node comments once per idempotency key, then soft deletes', async () => {
    const { answer } = await setup();
    expect(await api.listNodeComments(answer.id)).toEqual({ comments: [] });
    const key = newIdempotencyKey();
    const body = { nodeId: answer.nodes.nodes[0]!.id, body: '  A useful detail  ' };
    const result = await api.createNodeComment(answer.id, body, key);
    expect(result.comment).toMatchObject({ body: 'A useful detail', mine: true });
    expect(await api.createNodeComment(answer.id, body, key)).toEqual(result);
    dropFakeStoreMemory();
    expect(await api.createNodeComment(answer.id, body, key)).toEqual(result);
    expect(await api.listNodeComments(answer.id)).toEqual({ comments: [result.comment] });
    await expect(
      api.createNodeComment(answer.id, { ...body, body: 'Changed' }, key),
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(await api.deleteNodeComment(result.comment.id)).toBeUndefined();
    dropFakeStoreMemory();
    expect(await api.listNodeComments(answer.id)).toEqual({ comments: [] });
    await expect(api.deleteNodeComment(result.comment.id)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('validates length and node membership at the fake route, without consuming failed keys', async () => {
    const { answer } = await setup();
    const key = newIdempotencyKey();
    const send = (nodeId: string, body: string) =>
      request({
        method: 'POST',
        path: `/answers/${answer.id}/comments`,
        body: { nodeId, body },
        schema: CreateNodeCommentResponseSchema,
        idempotent: true,
        idempotencyKey: key,
      });
    for (const body of ['', '   ', 'a'.repeat(301)]) {
      await expect(send('k1', body)).rejects.toMatchObject({
        status: 400,
        code: 'VALIDATION_FAILED',
      });
    }
    await expect(send('missing-node', 'hi')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const result = await send(answer.nodes.nodes[0]!.id, 'a'.repeat(300));
    expect(result.comment.body).toHaveLength(300);
    await expect(
      request({
        method: 'POST',
        path: `/answers/${answer.id}/comments`,
        body: { nodeId: 'k1', body: 'hi' },
        schema: CreateNodeCommentResponseSchema,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_MISSING' });
  });

  it('keeps older versions readable and rejects draft and discarded pins', async () => {
    const { answer, setId } = await setup();
    const nodes = structuredClone(answer.nodes);
    nodes.nodes[0]!.enabled = !nodes.nodes[0]!.enabled;
    const revision = await api.createRevision(setId, { baseAnswerId: answer.id, nodes });
    const draft = await finish(revision.job);
    expect((await api.getAnswer(draft.id)).answer.status).toBe('draft');
    await expect(api.pinAnswer(draft.id, true)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await finish((await api.createRevision(setId, { baseAnswerId: answer.id, nodes })).job);
    expect((await api.getAnswer(draft.id)).answer.status).toBe('discarded');
    await expect(api.pinAnswer(draft.id, true)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect((await api.getAnswer(answer.id)).answer.status).toBe('accepted');
  });

  it('allows public-answer comments but forbids pinning and deleting another author’s comment', async () => {
    const detail = await api.getAgoraProject(FAKE_AGORA_IDS.original);
    const answer = detail.sets[0]!.latestAnswer!;
    expect((await api.getAnswer(answer.id)).answer).toEqual(answer);
    await expect(api.pinAnswer(answer.id, true)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
    const created = await api.createNodeComment(answer.id, {
      nodeId: answer.nodes.nodes[0]!.id,
      body: 'Public note',
    });
    const stored = fakeStore(false).nodeComments![0]!;
    stored.author = { ...FAKE_OTHER_CREATORS[0]! };
    stored.mine = false;
    saveFakeStore();
    dropFakeStoreMemory();
    expect((await api.listNodeComments(answer.id)).comments[0]?.mine).toBe(false);
    await expect(api.deleteNodeComment(created.comment.id)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  it('sorts oldest first, includes disabled nodes and keeps comments isolated by answer', async () => {
    const first = await setup();
    const second = await setup();
    const node = fakeStore(false).projects.find((p) => p.summary.id === first.projectId)!.sets[0]!
      .answers[0]!.nodes.nodes[0]!;
    node.enabled = false;
    const a = await api.createNodeComment(first.answer.id, { nodeId: node.id, body: 'First' });
    const b = await api.createNodeComment(first.answer.id, { nodeId: node.id, body: 'Second' });
    const records = fakeStore(false).nodeComments!;
    records[0]!.createdAt = '2026-11-02T00:00:00.000Z';
    records[1]!.createdAt = '2026-11-01T00:00:00.000Z';
    expect((await api.listNodeComments(first.answer.id)).comments.map((c) => c.id)).toEqual([
      b.comment.id,
      a.comment.id,
    ]);
    records[1]!.createdAt = records[0]!.createdAt;
    expect((await api.listNodeComments(first.answer.id)).comments.map((c) => c.id)).toEqual(
      [a.comment.id, b.comment.id].sort((a, b) => a.localeCompare(b)),
    );
    expect(await api.listNodeComments(second.answer.id)).toEqual({ comments: [] });
  });

  it('hides deleted projects and unknown answers, including their comments', async () => {
    const { answer, projectId } = await setup();
    const created = await api.createNodeComment(answer.id, {
      nodeId: answer.nodes.nodes[0]!.id,
      body: 'Note',
    });
    const stored = fakeStore(false).nodeComments![0]!;
    stored.author = { ...FAKE_OTHER_CREATORS[0]! };
    stored.mine = false;
    await api.deleteProject(projectId);
    await expect(api.getAnswer(answer.id)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    await expect(api.listNodeComments(answer.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      api.createNodeComment(answer.id, { nodeId: 'k1', body: 'Note' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(api.deleteNodeComment(created.comment.id)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    await expect(api.getAnswer(crypto.randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('persists verification enabled/decision changes without changing answer nodes or versions', async () => {
    const { answer, projectId } = await setup();
    const state = fakeStore(false).projects.find((p) => p.summary.id === projectId)!.sets[0]!
      .answers[0]!;
    const criterion = state.verification!.criteria[0]!;
    state.verification!.mismatches.push({ ...criterion, id: 'm1', kind: 'mismatch' });
    const result = await api.updateVerification(answer.id, {
      nodes: [
        { id: criterion.id, enabled: false },
        { id: 'm1', decision: 'removed' },
      ],
    });
    expect(result.verification.criteria[0]?.enabled).toBe(false);
    expect(result.verification.mismatches[0]?.enabled).toBe(false);
    dropFakeStoreMemory();
    const restored = (await api.getAnswer(answer.id)).answer;
    expect(restored.verification).toEqual(result.verification);
    expect(restored.nodes).toEqual(answer.nodes);
    expect(restored.number).toBe(answer.number);
    const kept = await api.updateVerification(answer.id, {
      nodes: [{ id: 'm1', decision: 'kept' }],
    });
    expect(kept.verification.mismatches[0]?.enabled).toBe(true);
    expect(kept.verification.criteria[0]?.enabled).toBe(false);
    expect((await api.getWorkspace(projectId)).sets[0]?.latestAnswer?.verification).toEqual(
      kept.verification,
    );
  });

  it('rejects verification batches atomically, malformed bodies and absent verification', async () => {
    const { answer, projectId } = await setup();
    const send = (body: unknown) =>
      request({
        method: 'PATCH',
        path: `/answers/${answer.id}/verification`,
        schema: UpdateVerificationResponseSchema,
        body,
      });
    const original = structuredClone(answer.verification!);
    await expect(
      send({
        nodes: [
          { id: original.criteria[0]!.id, enabled: false },
          { id: 'missing', enabled: false },
        ],
      }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    expect((await api.getAnswer(answer.id)).answer.verification).toEqual(original);
    for (const node of [
      { id: 'v1' },
      { id: 'v1', enabled: true, decision: 'kept' },
      { id: 'v1', decision: 'invalid' },
    ]) {
      await expect(send({ nodes: [node] })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    const state = fakeStore(false).projects.find((p) => p.summary.id === projectId)!.sets[0]!
      .answers[0]!;
    state.verification = null;
    await expect(api.updateVerification(answer.id, { nodes: [] })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(api.updateVerification(crypto.randomUUID(), { nodes: [] })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const publicAnswer = (await api.getAgoraProject(FAKE_AGORA_IDS.original)).sets[0]!
      .latestAnswer!;
    await expect(api.updateVerification(publicAnswer.id, { nodes: [] })).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  it('sends the live verification PATCH without an idempotency key and validates the response', async () => {
    const { answer } = await setup();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ verification: answer.verification }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ verification: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    apiConfig.mode = 'live';
    const body = { nodes: [{ id: 'v1', decision: 'removed' as const }] };
    expect(await api.updateVerification(answer.id, body)).toEqual({
      verification: answer.verification,
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url, 'https://example.test').pathname).toBe(
      `/answers/${answer.id}/verification`,
    );
    expect(init.method).toBe('PATCH');
    expect(init.headers).not.toHaveProperty('Idempotency-Key');
    expect(JSON.parse(init.body as string)).toEqual(body);
    await expect(api.updateVerification(answer.id, body)).rejects.toThrow();
  });

  it('uses existing fake delay and error controls without saving failed comments', async () => {
    const { answer } = await setup();
    const key = newIdempotencyKey();
    const body = { nodeId: answer.nodes.nodes[0]!.id, body: 'Retry note' };
    apiConfig.fakeError = 'AI_TIMEOUT';
    await expect(api.createNodeComment(answer.id, body, key)).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
    });
    apiConfig.fakeError = null;
    vi.useFakeTimers();
    try {
      apiConfig.fakeDelayMs = 100;
      const pending = api.createNodeComment(answer.id, body, key);
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(99);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect((await pending).comment.body).toBe('Retry note');
    } finally {
      vi.useRealTimers();
      apiConfig.fakeDelayMs = 0;
    }
    expect((await api.listNodeComments(answer.id)).comments).toHaveLength(1);
  });

  it('uses the live paths, auth and a reusable comment key, and parses response schemas', async () => {
    const { answer } = await setup();
    const comment = {
      id: crypto.randomUUID(),
      nodeId: 'k1',
      body: 'Note',
      author: FAKE_OTHER_CREATORS[0]!,
      createdAt: '2026-11-01T00:00:00.000Z',
      mine: false,
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ answer }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ pinned: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ comments: [comment] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ comment }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ comments: [{ ...comment, mine: 'yes' }] }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetch);
    apiConfig.mode = 'live';
    await api.getAnswer(answer.id);
    await api.pinAnswer(answer.id, true);
    await api.listNodeComments(answer.id);
    const key = newIdempotencyKey();
    await api.createNodeComment(answer.id, { nodeId: 'k1', body: ' Note ' }, key);
    await api.deleteNodeComment(comment.id);
    await expect(api.listNodeComments(answer.id)).rejects.toThrow();
    const calls = fetch.mock.calls as unknown as [string, RequestInit][];
    expect(
      calls
        .slice(0, 5)
        .map(([url, init]) => [new URL(url, 'https://example.test').pathname, init.method]),
    ).toEqual([
      [`/answers/${answer.id}`, 'GET'],
      [`/answers/${answer.id}/pin`, 'PUT'],
      [`/answers/${answer.id}/comments`, 'GET'],
      [`/answers/${answer.id}/comments`, 'POST'],
      [`/node-comments/${comment.id}`, 'DELETE'],
    ]);
    expect(calls[3]![1].headers).toMatchObject({
      'Idempotency-Key': key,
      Authorization: expect.stringContaining('Bearer '),
    });
    expect(JSON.parse(calls[3]![1].body as string)).toEqual({ nodeId: 'k1', body: 'Note' });
  });
});
