import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AcceptAnswerResponse, Answer, Node } from '@tome/shared';
import { QueryClient } from '@tanstack/react-query';
import { api, apiConfig, ApiRequestError, NetworkError, setSession } from '../../../shared/api';
import { createEditorRequests, useNodeEditor } from './useNodeEditor';

const node: Node = {
  id: 'k1',
  kind: 'keyword',
  stage: 'analyze',
  text: 'Lamp',
  enabled: true,
  parentIds: [],
  weight: 5,
};
const base = {
  id: 'base',
  setId: 'set',
  status: 'accepted',
  nodes: { schemaVersion: 1, subjectTemplate: 'Lamp', nodes: [node] },
} as Answer;
const draft = { ...base, id: 'draft', status: 'draft', baseAnswerId: base.id } as Answer;
beforeEach(() => vi.useFakeTimers());
const originalConfig = { ...apiConfig };
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.assign(apiConfig, originalConfig);
});
async function advance() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
}

it('invalidates the preview synchronously on another edit and cancels when restored', async () => {
  const requestPreview = vi.fn().mockResolvedValue(draft);
  const acceptPreview = vi.fn();
  const { result } = renderHook(() =>
    useNodeEditor({ base, requestPreview, acceptPreview, onAccepted: vi.fn() }),
  );
  act(() => result.current.edit({ ...node, weight: 7 }));
  await advance();
  expect(result.current.canApply).toBe(true);
  await act(async () => {
    result.current.edit({ ...node, weight: 8 });
    await result.current.apply();
  });
  expect(acceptPreview).not.toHaveBeenCalled();
  act(() => result.current.reset(node.id));
  await advance();
  expect(result.current.preview.status).toBe('idle');
  expect(requestPreview).toHaveBeenCalledOnce();
});

it('locks Apply immediately, keeps edits during failure, and accepts only the preview once', async () => {
  let resolve!: (response: AcceptAnswerResponse) => void;
  const acceptPreview = vi.fn().mockImplementation(
    () =>
      new Promise<AcceptAnswerResponse>((done) => {
        resolve = done;
      }),
  );
  const onAccepted = vi.fn();
  const requestPreview = vi.fn().mockResolvedValue(draft);
  const { result } = renderHook(() =>
    useNodeEditor({ base, requestPreview, acceptPreview, onAccepted }),
  );
  act(() => result.current.edit({ ...node, weight: 7 }));
  await advance();
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.apply();
    void result.current.apply();
    result.current.edit({ ...node, weight: 9 });
  });
  expect(acceptPreview).toHaveBeenCalledOnce();
  expect(result.current.snapshot.nodes[0]!.weight).toBe(7);
  await act(async () => {
    resolve({ answer: { id: 'draft', number: 2, status: 'accepted' } });
    await pending;
  });
  expect(onAccepted).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'draft', number: 2, status: 'accepted' }),
  );
  expect(result.current.stacked).toBe(true);
  expect(result.current.canApply).toBe(false);
});

it('keeps the accepted answer and edited values when Apply fails', async () => {
  const error = new Error('offline');
  const onAccepted = vi.fn();
  const requestPreview = vi.fn().mockResolvedValue(draft);
  const acceptPreview = vi.fn().mockRejectedValue(error);
  const { result } = renderHook(() =>
    useNodeEditor({ base, requestPreview, acceptPreview, onAccepted }),
  );
  act(() => result.current.edit({ ...node, weight: 6 }));
  await advance();
  await act(async () => {
    await result.current.apply();
  });
  expect(result.current.applyError).toBe(error);
  expect(result.current.snapshot.nodes[0]!.weight).toBe(6);
  expect(base.nodes.nodes[0]!.weight).toBe(5);
  expect(onAccepted).not.toHaveBeenCalled();
});

it('does not edit unaccepted answers or apply another set’s draft', async () => {
  const acceptPreview = vi.fn();
  const requestPreview = vi.fn().mockResolvedValue({ ...draft, setId: 'other' });
  const { result, unmount } = renderHook(() =>
    useNodeEditor({ base, requestPreview, acceptPreview, onAccepted: vi.fn() }),
  );
  act(() => result.current.edit({ ...node, weight: 6 }));
  await advance();
  await act(async () => {
    await result.current.apply();
  });
  expect(acceptPreview).not.toHaveBeenCalled();
  unmount();
  const other = renderHook(() =>
    useNodeEditor({ base: draft, requestPreview, acceptPreview, onAccepted: vi.fn() }),
  );
  act(() => other.result.current.edit({ ...node, weight: 9 }));
  expect(other.result.current.snapshot.nodes[0]!.weight).toBe(5);
});

async function realBase() {
  vi.useRealTimers();
  Object.assign(apiConfig, { mode: 'fake', fakeDelayMs: 0, fakeError: null });
  const session = await api.createSession('code');
  setSession(session.token, session.noticeVersion);
  await api.consent(session.noticeVersion);
  const created = await api.createProject({ prompt: 'A lighthouse' });
  let job = created.job!;
  let answer: Answer | undefined;
  while (job.nextStage) {
    const result = await api.advanceJob(job.id, job.nextStage);
    job = result.job;
    if (result.step.answer) answer = result.step.answer;
  }
  return { answer: answer!, projectId: created.project.id };
}
function modified(answer: Answer, weight = 8) {
  const nodes = structuredClone(answer.nodes);
  nodes.nodes.find((node) => node.id === 'k1')!.weight = weight;
  return nodes;
}
it('uses the real fake API to generate a verified draft and accept a new version', async () => {
  const { answer, projectId } = await realBase();
  const requests = createEditorRequests(answer, new QueryClient());
  const preview = await requests.preview(modified(answer), new AbortController().signal);
  expect(preview).toMatchObject({
    status: 'draft',
    baseAnswerId: answer.id,
    verification: { status: 'skipped' },
  });
  expect((await api.getWorkspace(projectId)).sets[0]!.latestAnswer!.id).toBe(answer.id);
  const accepted = await requests.accept(preview.id);
  expect(accepted.answer).toMatchObject({ id: preview.id, number: 2, status: 'accepted' });
});
it('retries only the failed nextStage and does not create another revision', async () => {
  const { answer } = await realBase();
  const original = api.advanceJob;
  let failed = false;
  const advance = vi.spyOn(api, 'advanceJob').mockImplementation(async (id, stage) => {
    if (stage === 'image' && !failed) {
      failed = true;
      throw new NetworkError();
    }
    return original(id, stage);
  });
  const create = vi.spyOn(api, 'createRevision');
  const requests = createEditorRequests(answer, new QueryClient());
  await expect(
    requests.preview(modified(answer), new AbortController().signal),
  ).rejects.toBeInstanceOf(NetworkError);
  const preview = await requests.preview(modified(answer), new AbortController().signal);
  expect(preview.status).toBe('draft');
  expect(create).toHaveBeenCalledOnce();
  expect(advance.mock.calls.map((call) => call[1])).toEqual([
    'assemble',
    'image',
    'image',
    'verify',
  ]);
});
it('keeps the Apply key when the successful server response is lost', async () => {
  const { answer, projectId } = await realBase();
  const requests = createEditorRequests(answer, new QueryClient());
  const preview = await requests.preview(modified(answer), new AbortController().signal);
  const original = api.acceptAnswer;
  const accept = vi.spyOn(api, 'acceptAnswer').mockImplementationOnce(async (...args) => {
    await original(...args);
    throw new NetworkError();
  });
  await expect(requests.accept(preview.id)).rejects.toBeInstanceOf(NetworkError);
  expect((await requests.accept(preview.id)).answer.number).toBe(2);
  expect(accept.mock.calls[0]![1]).toBe(accept.mock.calls[1]![1]);
  expect((await api.getWorkspace(projectId)).sets[0]!.answers).toHaveLength(2);
});
it('serializes revision creation and cancels a late response before starting the newer request', async () => {
  const { answer } = await realBase();
  const original = api.createRevision;
  let release!: () => void;
  let oldId = '';
  const create = vi.spyOn(api, 'createRevision').mockImplementationOnce(async (...args) => {
    const response = await original(...args);
    oldId = response.job.id;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return response;
  });
  const client = new QueryClient();
  const cache = vi.spyOn(client, 'setQueryData');
  const requests = createEditorRequests(answer, client);
  const controller = new AbortController();
  const old = requests.preview(modified(answer), controller.signal).catch((error: Error) => error);
  await waitFor(() => expect(oldId).not.toBe(''));
  controller.abort();
  const next = requests.preview(modified(answer, 9), new AbortController().signal);
  expect(create).toHaveBeenCalledOnce();
  release();
  expect(await old).toMatchObject({ name: 'AbortError' });
  const latest = await next;
  expect(latest.nodes.nodes.find((node) => node.id === 'k1')!.weight).toBe(9);
  expect((await api.getJob(oldId)).job.status).toBe('cancelled');
  expect(cache).not.toHaveBeenCalledWith(
    ['revision-preview', answer.id],
    expect.objectContaining({ job: expect.objectContaining({ id: oldId }) }),
  );
});
it('invalidates an expired draft after NOT_DRAFT rather than repeatedly applying it', async () => {
  const onAccepted = vi.fn();
  const requestPreview = vi.fn().mockResolvedValue(draft);
  const acceptPreview = vi
    .fn()
    .mockRejectedValue(
      new ApiRequestError(409, { code: 'NOT_DRAFT', message: 'Expired', retryable: false }),
    );
  const { result } = renderHook(() =>
    useNodeEditor({ base, requestPreview, acceptPreview, onAccepted }),
  );
  act(() => result.current.edit({ ...node, weight: 6 }));
  await advance();
  await act(async () => {
    await result.current.apply();
  });
  expect(result.current.canApply).toBe(false);
  expect(result.current.applyError).toBeTruthy();
  expect(onAccepted).not.toHaveBeenCalled();
});

it('restores a priority position without leaving duplicate order values', async () => {
  const p1: Node = {
    id: 's1',
    kind: 'priority',
    stage: 'research',
    text: 'First',
    enabled: true,
    parentIds: [],
    order: 10,
    aiInitial: { order: 10 },
  };
  const p2: Node = { ...p1, id: 's2', text: 'Second', order: 20, aiInitial: { order: 20 } };
  const priorityBase = { ...base, nodes: { ...base.nodes, nodes: [p1, p2] } };
  const requestPreview = vi.fn();
  const { result } = renderHook(() =>
    useNodeEditor({
      base: priorityBase,
      requestPreview,
      acceptPreview: vi.fn(),
      onAccepted: vi.fn(),
    }),
  );
  act(() => result.current.reorder('s1', 's2'));
  expect(result.current.snapshot.nodes.map((entry) => entry.order)).toEqual([20, 10]);
  act(() => result.current.reset('s1'));
  expect(result.current.snapshot.nodes.map((entry) => entry.order)).toEqual([10, 20]);
  await advance();
  expect(requestPreview).not.toHaveBeenCalled();
});
