import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AcceptAnswerResponseSchema,
  CreateRevisionResponseSchema,
  type Answer,
  type CreateRevisionRequest,
  type Job,
} from '@tome/shared';
import { api, apiConfig, clearSession, newIdempotencyKey, setSession, request } from './index';
import { resetFake, fakeState } from './fake/state';
import { dropFakeStoreMemory } from './fake/store';

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
async function finish(initial: Job) {
  let job = initial;
  while (job.nextStage) job = (await api.advanceJob(job.id, job.nextStage)).job;
  const result = await api.getJob(job.id);
  return result.steps.find((step) => step.answer)?.answer as Answer;
}
async function setup() {
  const created = await api.createProject({ prompt: 'A lighthouse beside a stormy sea' });
  const base = await finish(created.job!);
  return {
    base,
    projectId: created.project.id,
    pageId: created.job!.pageId,
    setId: created.set!.id,
  };
}
function edit(base: Answer, id = 'k1'): CreateRevisionRequest {
  const nodes = structuredClone(base.nodes);
  const node = nodes.nodes.find((entry) => entry.id === id)!;
  if (node.kind === 'keyword' || node.kind === 'attribute') node.weight = (node.weight ?? 5) + 1;
  else node.enabled = !node.enabled;
  return { baseAnswerId: base.id, nodes };
}

describe('revision fake flow', () => {
  it('requires idempotency headers on both mutation routes', async () => {
    const { base, setId } = await setup();
    await expect(
      request({
        method: 'POST',
        path: `/sets/${setId}/revisions`,
        body: edit(base),
        schema: CreateRevisionResponseSchema,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_MISSING' });
    await expect(
      request({
        method: 'POST',
        path: `/answers/${base.id}/accept`,
        schema: AcceptAnswerResponseSchema,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_MISSING' });
  });
  it('resumes a draft job after reload, keeps accepted results until Apply, and persists the next version exactly once', async () => {
    const { base, projectId, setId } = await setup();
    const created = await api.createRevision(setId, edit(base));
    expect(created).toMatchObject({
      startStage: 'assemble',
      changes: [{ nodeId: 'k1', field: 'weight' }],
      job: { setId, startStage: 'assemble', nextStage: 'assemble' },
    });
    await api.advanceJob(created.job.id, 'assemble');
    dropFakeStoreMemory();
    const resumed = await api.getJob(created.job.id);
    expect(resumed.job.nextStage).toBe('image');
    const draft = await finish(resumed.job);
    expect(draft).toMatchObject({
      status: 'draft',
      number: null,
      origin: 'edited',
      imageMode: 'edit',
      baseAnswerId: base.id,
    });
    expect(draft.nodes.nodes.find((node) => node.id === 'k1')!.weight).toBe(8);
    expect(base.nodes.nodes.find((node) => node.id === 'k1')!.weight).toBe(7);
    let workspace = await api.getWorkspace(projectId);
    expect(workspace.sets[0]!.latestAnswer!.id).toBe(base.id);
    expect((await api.getFinishCandidates(projectId)).answers).toHaveLength(1);
    const key = newIdempotencyKey();
    const accepted = await api.acceptAnswer(draft.id, key);
    expect(accepted.answer).toEqual({ id: draft.id, number: 2, status: 'accepted' });
    dropFakeStoreMemory();
    expect(await api.acceptAnswer(draft.id, key)).toEqual(accepted);
    workspace = await api.getWorkspace(projectId);
    expect(workspace.sets[0]!.answers.map((answer) => answer.number)).toEqual([1, 2]);
    expect(workspace.sets[0]!.latestAnswer!.nodes).toEqual(draft.nodes);
    expect(
      (await api.getJob(created.job.id)).steps.find((step) => step.answer)?.answer,
    ).toMatchObject({ status: 'accepted', number: 2 });
    await expect(api.acceptAnswer(draft.id)).rejects.toMatchObject({
      code: 'NOT_DRAFT',
      status: 409,
    });
  });
  it('reuses the same revision key across reload and rejects a changed request with that key', async () => {
    const { base, setId } = await setup();
    const body = edit(base);
    const key = newIdempotencyKey();
    const result = await api.createRevision(setId, body, key);
    dropFakeStoreMemory();
    expect(await api.createRevision(setId, body, key)).toEqual(result);
    const changed = structuredClone(body);
    changed.nodes.nodes[0]!.weight = 9;
    await expect(api.createRevision(setId, changed, key)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
    expect((await api.getJob(result.job.id)).job.status).toBe('pending');
  });
  it('returns NO_CHANGES without creating a job', async () => {
    const { base, setId, projectId } = await setup();
    await expect(
      api.createRevision(setId, { baseAnswerId: base.id, nodes: base.nodes }),
    ).rejects.toMatchObject({ code: 'NO_CHANGES', status: 422 });
    expect((await api.getWorkspace(projectId)).activeJob).toBeUndefined();
  });
  it.each(['k1', 'a1', 'd1', 's1', 'e1'])(
    'starts at the correct downstream stage for %s',
    async (id) => {
      const { base, setId } = await setup();
      const expected = ['k1', 'a1'].includes(id) ? 'assemble' : id === 'e1' ? 'draft' : 'evidence';
      const revision = await api.createRevision(setId, edit(base, id));
      expect(revision.startStage).toBe(expected);
      const draft = await finish(revision.job);
      expect(draft.status).toBe('draft');
      expect(draft.nodes.nodes.find((node) => node.id === id)).toEqual(
        edit(base, id).nodes.nodes.find((node) => node.id === id),
      );
    },
  );
  it('blocks another set while a revision is active without cancelling the first job', async () => {
    const { base, setId, projectId, pageId } = await setup();
    const second = await api.createSet(projectId, { pageId, prompt: 'Another lighthouse' });
    const secondBase = await finish(second.job);
    const first = await api.createRevision(setId, edit(base));
    await expect(api.createRevision(second.set.id, edit(secondBase))).rejects.toMatchObject({
      code: 'GENERATION_IN_PROGRESS',
    });
    expect((await api.getJob(first.job.id)).job.status).toBe('pending');
  });
  it('blocks revision while the same set’s original create job is still verifying', async () => {
    const created = await api.createProject({ prompt: 'Lighthouse' });
    let job = created.job!;
    let base: Answer | undefined;
    while (job.nextStage !== 'verify') {
      const result = await api.advanceJob(job.id, job.nextStage!);
      job = result.job;
      if (result.step.answer) base = result.step.answer;
    }
    await expect(api.createRevision(created.set!.id, edit(base!))).rejects.toMatchObject({
      code: 'GENERATION_IN_PROGRESS',
    });
    expect((await api.getJob(job.id)).job.nextStage).toBe('verify');
  });
  it('cancels the same set’s active revision, discards its draft, and rejects its advance and Apply', async () => {
    const { base, setId } = await setup();
    const first = await api.createRevision(setId, edit(base));
    await api.advanceJob(first.job.id, 'assemble');
    const image = await api.advanceJob(first.job.id, 'image');
    const nextBody = edit(base);
    nextBody.nodes.nodes[0]!.weight = 9;
    const next = await api.createRevision(setId, nextBody);
    expect((await api.getJob(first.job.id)).job.status).toBe('cancelled');
    await expect(api.advanceJob(first.job.id, 'assemble')).rejects.toMatchObject({
      code: 'JOB_CLOSED',
    });
    dropFakeStoreMemory();
    await finish(next.job);
    expect((await api.getJob(first.job.id)).steps.find((step) => step.answer)?.answer!.status).toBe(
      'discarded',
    );
    await expect(api.acceptAnswer(image.step.answer!.id)).rejects.toMatchObject({
      code: 'NOT_DRAFT',
    });
  });
  it.each(['daily', 'budget'] as const)(
    'rejects %s limits without sample fallback or a new job',
    async (limit) => {
      const { base, setId, projectId } = await setup();
      fakeState.limit = limit;
      await expect(api.createRevision(setId, edit(base))).rejects.toMatchObject({
        status: 429,
        code: limit === 'daily' ? 'DAILY_LIMIT_REACHED' : 'BUDGET_REACHED',
      });
      expect((await api.getWorkspace(projectId)).activeJob).toBeUndefined();
    },
  );
  it('rechecks the limit at image generation and preserves the accepted answer', async () => {
    const { base, setId, projectId } = await setup();
    const revision = await api.createRevision(setId, edit(base));
    await api.advanceJob(revision.job.id, 'assemble');
    fakeState.limit = 'budget';
    await expect(api.advanceJob(revision.job.id, 'image')).rejects.toMatchObject({
      code: 'BUDGET_REACHED',
    });
    expect((await api.getWorkspace(projectId)).sets[0]!.latestAnswer!.id).toBe(base.id);
  });
  it.each(['text', 'template', 'add', 'remove', 'axes'] as const)(
    'rejects invalid %s edits before creating a job',
    async (field) => {
      const { base, setId } = await setup();
      const body = edit(base);
      if (field === 'text') body.nodes.nodes[0]!.text = 'Changed';
      if (field === 'template') body.nodes.subjectTemplate = 'Changed';
      if (field === 'add') body.nodes.nodes.push({ ...body.nodes.nodes[0]!, id: 'k9' });
      if (field === 'remove') body.nodes.nodes.pop();
      if (field === 'axes') body.nodes.nodes[0]!.pad!.xAxis = ['Other', 'Axes'];
      await expect(api.createRevision(setId, body)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    },
  );
  it('rejects missing/cross-set bases and drafts as bases', async () => {
    const { base, setId, projectId, pageId } = await setup();
    const second = await api.createSet(projectId, { pageId, prompt: 'Other' });
    await finish(second.job);
    await expect(api.createRevision(second.set.id, edit(base))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(api.acceptAnswer(newIdempotencyKey())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const revision = await api.createRevision(setId, edit(base));
    const draft = await finish(revision.job);
    await expect(
      api.createRevision(setId, { ...edit(base), baseAnswerId: draft.id }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
  it('validates live request and response schemas and forwards stable idempotency keys', async () => {
    const { base, setId } = await setup();
    const body = edit(base);
    const fake = await api.createRevision(setId, body);
    apiConfig.mode = 'live';
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(fake), { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ answer: { id: base.id, number: 2, status: 'accepted' } })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ invalid: true })));
    vi.stubGlobal('fetch', fetch);
    const key = newIdempotencyKey();
    expect(await api.createRevision(setId, body, key)).toEqual(fake);
    expect(fetch.mock.calls[0]![0]).toBe(`/sets/${setId}/revisions`);
    expect(fetch.mock.calls[0]![1].headers['Idempotency-Key']).toBe(key);
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(body);
    await api.acceptAnswer(base.id, key);
    expect(fetch.mock.calls[1]![0]).toBe(`/answers/${base.id}/accept`);
    expect(fetch.mock.calls[1]![1].headers['Idempotency-Key']).toBe(key);
    await expect(api.acceptAnswer(base.id)).rejects.toThrow();
  });
});
