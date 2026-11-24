import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Answer, GetJobResponse, Node, Verification, WorkspaceResponse } from '@tome/shared';
import { useSessionStore } from '../../../shared/api';
import { answerKey } from './useAnswerHistory';
import { useVerificationEditor } from './useVerificationEditor';

afterEach(cleanup);
beforeEach(() => useSessionStore.setState({ token: 'token' }));

const criterion = (id: string, enabled = true): Node => ({
  id,
  kind: 'criterion',
  stage: 'verify',
  text: `Criterion ${id}`,
  enabled,
  parentIds: [],
});
const verification: Verification = {
  status: 'skipped',
  criteria: [criterion('v1'), criterion('v2')],
  mismatches: [],
};
const answer = {
  id: '00000000-0000-4000-8000-0000000000a1',
  setId: '00000000-0000-4000-8000-0000000000s1',
  number: 1,
  status: 'accepted',
  nodes: { schemaVersion: 1, subjectTemplate: 'Lamp', nodes: [] },
  verification,
} as unknown as Answer;

function setup(save = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  client.setQueryData(answerKey('token', answer.id), answer);
  client.setQueryData(['workspace', 'p1', null], {
    sets: [{ id: answer.setId, latestAnswer: answer, answers: [] }],
  } as unknown as WorkspaceResponse);
  client.setQueryData(['generation', 'p1', 'page', 'job'], {
    job: { id: 'job' },
    steps: [
      { stage: 'image', status: 'succeeded', answer: { ...answer, verification: null } },
      { stage: 'verify', status: 'succeeded', verification },
    ],
  } as unknown as GetJobResponse);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useVerificationEditor('p1', save), { wrapper });
  const enabled = () => ({
    answer: client
      .getQueryData<Answer>(answerKey('token', answer.id))!
      .verification!.criteria.map((node) => node.enabled),
    workspace: client
      .getQueryData<WorkspaceResponse>(['workspace', 'p1', null])!
      .sets[0]!.latestAnswer!.verification!.criteria.map((node) => node.enabled),
    step: client
      .getQueryData<GetJobResponse>(['generation', 'p1', 'page', 'job'])!
      .steps[1]!.verification!.criteria.map((node) => node.enabled),
  });
  return { client, hook, enabled, save };
}

it('updates every canvas cache first, locks while saving and keeps the saved value', async () => {
  let resolve!: (value: unknown) => void;
  const save = vi.fn(() => new Promise((done) => (resolve = done)));
  const { hook, enabled } = setup(save);
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current.change(answer, [{ id: 'v1', enabled: false }]);
  });
  expect(enabled()).toEqual({
    answer: [false, true],
    workspace: [false, true],
    step: [false, true],
  });
  expect(hook.result.current.saving).toEqual({ answerId: answer.id, ids: ['v1'] });
  // 저장 중 다음 변경은 받지 않는다
  await act(() => hook.result.current.change(answer, [{ id: 'v2', enabled: false }]));
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith(answer.id, { nodes: [{ id: 'v1', enabled: false }] });
  await act(async () => {
    resolve({
      verification: { ...verification, criteria: [criterion('v1', false), criterion('v2')] },
    });
    await pending;
  });
  expect(hook.result.current.saving).toBeUndefined();
  expect(hook.result.current.error).toBeUndefined();
  expect(enabled().answer).toEqual([false, true]);
});

it('rolls back to the previous values and exposes the error when saving fails', async () => {
  const failure = new Error('offline');
  const save = vi.fn().mockRejectedValue(failure);
  const { hook, enabled } = setup(save);
  await act(() =>
    hook.result.current.change(answer, [
      { id: 'v1', enabled: false },
      { id: 'v2', enabled: false },
    ]),
  );
  expect(enabled()).toEqual({ answer: [true, true], workspace: [true, true], step: [true, true] });
  expect(hook.result.current.error).toEqual({ answerId: answer.id, error: failure });
  expect(hook.result.current.saving).toBeUndefined();
  act(() => hook.result.current.clearError());
  expect(hook.result.current.error).toBeUndefined();
});

it('ignores empty changes and unknown node ids', async () => {
  const save = vi.fn();
  const { hook } = setup(save);
  await act(() => hook.result.current.change(answer, []));
  await act(() => hook.result.current.change(answer, [{ id: 'k1', enabled: false }]));
  expect(save).not.toHaveBeenCalled();
});
