import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JobStageSchema, type Connection, type WorkspaceResponse } from '@tome/shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, clearSession, setSession } from '../../../shared/api';
import { FAKE_NOTICE_VERSION, FAKE_TOKEN } from '../../../shared/api/fake/data';
import { FAKE_OTHER_CREATORS } from '../../../shared/api/fake/identity';
import { fakeState, resetFake } from '../../../shared/api/fake/state';
import { answerIdsOf, groupConnections, useRemixConnections } from './useRemixConnections';

const [LIND] = FAKE_OTHER_CREATORS;
if (LIND === undefined) throw new Error('가짜 창작자가 없다');

const connection = (id: string, status: Connection['status']): Connection => ({
  id,
  nodeId: 'k1',
  predictedAction: 'Lean on evidence',
  sentence: 'Leaned on evidence 7 of 10 times',
  status,
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** 가짜 서버에서 세트 하나를 끝까지 만든 워크스페이스(상대는 고를 수 있다). */
async function workspaceWithAnswer(partnerId?: string): Promise<WorkspaceResponse> {
  const { project, job } = await api.createProject({
    prompt: 'A lighthouse at dusk',
    ...(partnerId === undefined ? {} : { remixPartnerId: partnerId }),
  });
  if (job === undefined) throw new Error('job 이 없다');
  for (const stage of JobStageSchema.options) await api.advanceJob(job.id, stage);
  return api.getWorkspace(project.id);
}

beforeEach(() => {
  localStorage.clear();
  resetFake();
  fakeState.consented = true;
  setSession(FAKE_TOKEN, FAKE_NOTICE_VERSION);
});

afterEach(() => {
  clearSession();
  vi.restoreAllMocks();
});

describe('groupConnections · answerIdsOf', () => {
  it('답변별로 묶고 숨긴 것은 빼며, 아직 못 받은 답변은 빈 목록', () => {
    expect(
      groupConnections(
        ['a1', 'a2'],
        [[connection('c1', 'shown'), connection('c2', 'dismissed'), connection('c3', 'applied')]],
      ),
    ).toEqual({ a1: [connection('c1', 'shown'), connection('c3', 'applied')], a2: [] });
  });

  it('답변이 있는 세트의 최신 답변 id 만 고른다', async () => {
    const workspace = await workspaceWithAnswer();
    const ids = answerIdsOf(workspace);
    expect(ids).toEqual([workspace.sets[0]?.latestAnswer?.id]);
    expect(answerIdsOf({ sets: [] })).toEqual([]);
  });
});

describe('useRemixConnections', () => {
  it('리믹스 상대가 없으면 undefined(캔버스는 지금처럼)이고 Connection 을 부르지 않는다', async () => {
    const list = vi.spyOn(api, 'listConnections');
    const workspace = await workspaceWithAnswer();
    const { result } = renderHook(() => useRemixConnections(workspace), { wrapper });
    expect(result.current).toBeUndefined();
    expect(list).not.toHaveBeenCalled();
  });

  it('상대가 있으면 답변마다 Connection 을 받아 답변 id 로 묶는다', async () => {
    const workspace = await workspaceWithAnswer(LIND.id);
    const answerId = workspace.sets[0]?.latestAnswer?.id ?? '';
    const { result } = renderHook(() => useRemixConnections(workspace), { wrapper });
    await waitFor(() =>
      expect(result.current?.connectionsByAnswer[answerId]?.length).toBeGreaterThan(0),
    );
  });

  it('Apply 로 고른 Connection id 를 답변별로 모으고, 같은 것을 두 번 골라도 한 번만 둔다', async () => {
    const workspace = await workspaceWithAnswer(LIND.id);
    const answerId = workspace.sets[0]?.latestAnswer?.id ?? '';
    const { result } = renderHook(() => useRemixConnections(workspace), { wrapper });
    await waitFor(() =>
      expect(result.current?.connectionsByAnswer[answerId]?.length).toBeGreaterThan(0),
    );
    const target = result.current?.connectionsByAnswer[answerId]?.[0];
    if (target === undefined) throw new Error('Connection 이 없다');
    await act(() => result.current?.onApply(answerId, target) ?? Promise.resolve());
    await act(() => result.current?.onApply(answerId, target) ?? Promise.resolve());
    expect(result.current?.appliedIdsFor(answerId)).toEqual([target.id]);
  });

  it('숨기면 서버에 dismiss 하고, 다시 받은 목록에서 빠진다', async () => {
    const dismiss = vi.spyOn(api, 'dismissConnection');
    const workspace = await workspaceWithAnswer(LIND.id);
    const answerId = workspace.sets[0]?.latestAnswer?.id ?? '';
    const { result } = renderHook(() => useRemixConnections(workspace), { wrapper });
    await waitFor(() =>
      expect(result.current?.connectionsByAnswer[answerId]?.length).toBeGreaterThan(0),
    );
    const before = result.current?.connectionsByAnswer[answerId] ?? [];
    const target = before[0];
    if (target === undefined) throw new Error('Connection 이 없다');
    await act(() => result.current?.onDismiss(answerId, target) ?? Promise.resolve());
    expect(dismiss).toHaveBeenCalledWith(target.id);
    await waitFor(() =>
      expect(result.current?.connectionsByAnswer[answerId]?.map((c) => c.id)).not.toContain(
        target.id,
      ),
    );
  });
});

it('retains previous-partner Connections and keeps a dismissed one hidden when switching back', async () => {
  const [first, second] = FAKE_OTHER_CREATORS;
  if (!first || !second) throw new Error('Missing fixtures');
  const workspace = await workspaceWithAnswer(first.id);
  const answerId = workspace.sets[0]!.latestAnswer!.id;
  const { result, rerender } = renderHook(({ value }) => useRemixConnections(value), {
    initialProps: { value: workspace },
    wrapper,
  });
  await waitFor(() =>
    expect(result.current?.connectionsByAnswer[answerId]?.length).toBeGreaterThan(0),
  );
  const original = result.current!.connectionsByAnswer[answerId]!;
  const hidden = original[0]!;
  await act(() => result.current!.onDismiss(answerId, hidden));
  await api.setRemixPartner(workspace.project.id, second.id);
  const updated = await api.getWorkspace(workspace.project.id);
  rerender({ value: updated });
  await waitFor(() =>
    expect(result.current?.connectionsByAnswer[answerId]?.length).toBeGreaterThan(
      original.length - 1,
    ),
  );
  expect(result.current!.connectionsByAnswer[answerId]!.map((c) => c.id)).toContain(
    original[1]!.id,
  );
  expect(result.current!.connectionsByAnswer[answerId]!.map((c) => c.id)).not.toContain(hidden.id);
  await api.setRemixPartner(workspace.project.id, first.id);
  rerender({ value: await api.getWorkspace(workspace.project.id) });
  await waitFor(() =>
    expect(result.current?.connectionsByAnswer[answerId]?.map((c) => c.id)).not.toContain(
      hidden.id,
    ),
  );
});

it('keeps generation data usable when a connection query fails and exposes a retry', async () => {
  const workspace = await workspaceWithAnswer(LIND.id);
  const list = vi.spyOn(api, 'listConnections').mockRejectedValueOnce(new Error('offline'));
  const { result } = renderHook(() => useRemixConnections(workspace), { wrapper });
  await waitFor(() => expect(result.current?.error).toBeTruthy());
  expect(result.current!.connectionsByAnswer[workspace.sets[0]!.latestAnswer!.id]).toEqual([]);
  act(() => result.current!.retry());
  await waitFor(() => expect(result.current?.error).toBeFalsy());
  expect(list).toHaveBeenCalledTimes(2);
});
