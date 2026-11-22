import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Answer, GetAnswerResponse, PromptSet } from '@tome/shared';
import { orderedAnswers, useAnswerHistory } from './useAnswerHistory';
afterEach(cleanup);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const answer = (n: number): Answer => ({
  id: id(n),
  setId: id(9),
  number: n,
  pinned: false,
  isSample: false,
  thumbUrl: '/image',
  imageUrl: '/image',
  createdAt: '2026-11-19T00:00:00Z',
  status: 'accepted',
  origin: 'generated',
  imageMode: 'generate',
  baseAnswerId: null,
  nodes: { schemaVersion: 1, subjectTemplate: 'Lamp', nodes: [] },
  verification: null,
});
const sets: PromptSet[] = [
  {
    id: id(9),
    position: 1,
    prompt: 'Lamp',
    latestAnswer: answer(3),
    answers: [answer(3), answer(1), answer(2)],
  },
];
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const api = {
    getAnswer: vi.fn(async (value: string) => ({
      answer: [answer(1), answer(2), answer(3)].find((entry) => entry.id === value)!,
    })),
    setPinned: vi.fn().mockResolvedValue(undefined),
  };
  return { client, wrapper, api };
}
it('orders versions without mutating the workspace array and selects answers by ID', async () => {
  expect(orderedAnswers(sets[0]!.answers).map((entry) => entry.number)).toEqual([1, 2, 3]);
  expect(sets[0]!.answers[0]!.number).toBe(3);
  const { api, wrapper } = setup();
  const { result } = renderHook(() => useAnswerHistory('project', sets, api), { wrapper });
  act(() => result.current.select(id(9), id(1)));
  await waitFor(() => expect(result.current.sets[0]!.latestAnswer!.id).toBe(id(1)));
  expect(api.getAnswer).toHaveBeenCalledWith(id(1));
});
it('keeps the displayed version on load failure or an invalid cross-set response', async () => {
  const { api, wrapper } = setup();
  api.getAnswer.mockResolvedValueOnce({ answer: { ...answer(1), setId: id(99) } });
  const { result } = renderHook(() => useAnswerHistory('project', sets, api), { wrapper });
  act(() => result.current.select(id(9), id(1)));
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.sets[0]!.latestAnswer!.id).toBe(id(3));
});
it('does not let an older version request replace a later selection', async () => {
  const { api, wrapper } = setup();
  let resolve!: (response: GetAnswerResponse) => void;
  api.getAnswer.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { result } = renderHook(() => useAnswerHistory('project', sets, api), { wrapper });
  act(() => result.current.select(id(9), id(1)));
  await waitFor(() => expect(api.getAnswer).toHaveBeenCalledOnce());
  act(() => result.current.select(id(9), id(2)));
  await waitFor(() => expect(result.current.sets[0]!.latestAnswer!.id).toBe(id(2)));
  await act(async () => resolve({ answer: answer(1) }));
  expect(result.current.sets[0]!.latestAnswer!.id).toBe(id(2));
});
it('locks repeated pin requests and updates the original answer when the user switches versions', async () => {
  const { api, wrapper, client } = setup();
  let resolve!: () => void;
  api.setPinned.mockImplementation(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  const { result } = renderHook(() => useAnswerHistory('project', sets, api), { wrapper });
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.togglePin(id(3), true);
    void result.current.togglePin(id(3), true);
  });
  await waitFor(() => expect(api.setPinned).toHaveBeenCalledOnce());
  act(() => result.current.select(id(9), id(1)));
  await waitFor(() => expect(result.current.sets[0]!.latestAnswer!.id).toBe(id(1)));
  await act(async () => {
    resolve();
    await pending;
  });
  expect(client.getQueryData<Answer>(['canvas-answer', null, id(3)])!.pinned).toBe(true);
  expect(result.current.sets[0]!.latestAnswer!.pinned).toBe(false);
});
it('keeps original behavior without history callbacks', () => {
  const { wrapper } = setup();
  const { result } = renderHook(() => useAnswerHistory('project', sets), { wrapper });
  expect(result.current.sets[0]!.latestAnswer).toBe(sets[0]!.latestAnswer);
});

it('rejects a draft answer response and does not pin a cached draft', async () => {
  const draft = { ...answer(1), status: 'draft' as const, number: null };
  const { wrapper, api, client } = setup();
  api.getAnswer.mockResolvedValueOnce({ answer: draft });
  const { result } = renderHook(() => useAnswerHistory('project', sets, api), { wrapper });
  act(() => result.current.select(id(9), draft.id));
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.sets[0]!.latestAnswer!.id).toBe(id(3));
  client.setQueryData(['canvas-answer', null, draft.id], draft);
  await act(async () => result.current.togglePin(draft.id, true));
  expect(api.setPinned).not.toHaveBeenCalled();
});

it('returns to the latest accepted version after Apply clears the historical selection', async () => {
  const { api, wrapper } = setup();
  const { result } = renderHook(() => useAnswerHistory('project', sets, api), { wrapper });
  act(() => result.current.select(id(9), id(1)));
  await waitFor(() => expect(result.current.sets[0]!.latestAnswer!.id).toBe(id(1)));
  act(() => result.current.resetSelection(id(9)));
  await waitFor(() => expect(result.current.sets[0]!.latestAnswer!.id).toBe(id(3)));
});
