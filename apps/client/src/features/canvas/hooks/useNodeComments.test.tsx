import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { NodeComment } from '@tome/shared';
import { useNodeComments } from './useNodeComments';
afterEach(cleanup);
const comment: NodeComment = {
  id: '00000000-0000-4000-8000-000000000001',
  nodeId: 'k1',
  body: 'Reason',
  mine: true,
  createdAt: '2026-11-19T00:00:00Z',
  author: {
    id: '00000000-0000-4000-8000-000000000002',
    kind: 'visitor',
    displayName: 'Visitor',
    bio: null,
    avatarUrl: null,
  },
};
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const api = {
    listComments: vi.fn().mockResolvedValue([]),
    addComment: vi.fn().mockResolvedValue(comment),
    deleteComment: vi.fn().mockResolvedValue(undefined),
  };
  return { client, wrapper, api };
}
it('trims comments, blocks invalid input, and preserves a key only across failed retries', async () => {
  const { api, wrapper } = setup();
  api.addComment.mockRejectedValueOnce(new Error('offline'));
  const { result } = renderHook(() => useNodeComments('answer', 'k1', api), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await result.current.submit(' ');
    await result.current.submit('x'.repeat(301));
  });
  expect(api.addComment).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.submit(' Reason ');
  });
  await act(async () => {
    await result.current.submit(' Reason ');
  });
  expect(api.addComment.mock.calls[0]![1]).toEqual({ nodeId: 'k1', body: 'Reason' });
  expect(api.addComment.mock.calls[0]![2]).toBe(api.addComment.mock.calls[1]![2]);
  await act(async () => {
    await result.current.submit('Reason');
  });
  expect(api.addComment.mock.calls[2]![2]).not.toBe(api.addComment.mock.calls[0]![2]);
});
it('locks duplicate submission immediately and keeps late responses in their original answer cache', async () => {
  const { api, wrapper, client } = setup();
  let resolve!: (comment: NodeComment) => void;
  api.addComment.mockImplementation(
    () =>
      new Promise<NodeComment>((done) => {
        resolve = done;
      }),
  );
  const { result, rerender } = renderHook(
    ({ answer, node }) => useNodeComments(answer, node, api),
    { initialProps: { answer: 'old', node: 'k1' }, wrapper },
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  let pending!: Promise<NodeComment | undefined>;
  act(() => {
    pending = result.current.submit('Reason');
    void result.current.submit('Reason');
  });
  await waitFor(() => expect(api.addComment).toHaveBeenCalledOnce());
  rerender({ answer: 'new', node: 'k2' });
  await act(async () => {
    resolve(comment);
    await pending;
  });
  expect(result.current.comments).toEqual([]);
  expect(client.getQueryData(['canvas-comments', null, 'old'])).toEqual([comment]);
});
it('never deletes another author’s comment and retains own comments on failure', async () => {
  const { api, wrapper } = setup();
  const other = { ...comment, id: '00000000-0000-4000-8000-000000000003', mine: false };
  api.listComments.mockResolvedValue([comment, other]);
  api.deleteComment.mockRejectedValueOnce(new Error('offline'));
  const { result } = renderHook(() => useNodeComments('answer', 'k1', api), { wrapper });
  await waitFor(() => expect(result.current.comments).toHaveLength(2));
  await act(async () => {
    await result.current.remove(other.id);
  });
  expect(api.deleteComment).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.remove(comment.id);
  });
  expect(result.current.comments).toHaveLength(2);
  await act(async () => {
    await result.current.remove(comment.id);
  });
  await waitFor(() => expect(result.current.comments).toEqual([other]));
});
it('gathers a group under its first row id and posts there (#241)', async () => {
  const { api, wrapper } = setup();
  const second = { ...comment, id: '00000000-0000-4000-8000-000000000004', nodeId: 'v2' };
  const other = { ...comment, id: '00000000-0000-4000-8000-000000000005', nodeId: 'k1' };
  api.listComments.mockResolvedValue([second, other]);
  api.addComment.mockResolvedValue({ ...comment, nodeId: 'v1' });
  const { result } = renderHook(() => useNodeComments('answer', ['v1', 'v2'], api), { wrapper });
  await waitFor(() => expect(result.current.comments).toEqual([second]));
  await act(async () => {
    await result.current.submit('Group reason');
  });
  expect(api.addComment.mock.calls[0]![1]).toEqual({ nodeId: 'v1', body: 'Group reason' });
  await act(async () => {
    await result.current.remove(second.id);
  });
  expect(api.deleteComment).toHaveBeenCalledWith(second.id);
});
