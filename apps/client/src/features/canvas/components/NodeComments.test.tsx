import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { NodeComment } from '@tome/shared';
import { NodeComments } from './NodeComments';
afterEach(cleanup);
const labels = {
  title: 'Node comments',
  submit: 'Save comment',
  close: 'Close',
  empty: 'No comments',
  loading: 'Loading',
  saved: 'Saved',
};
const comment: NodeComment = {
  id: '00000000-0000-4000-8000-000000000001',
  nodeId: 'k1',
  body: '<img src=x onerror=alert(1)>',
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
function setup(comments: NodeComment[] = []) {
  const api = {
    listComments: vi.fn().mockResolvedValue(comments),
    addComment: vi.fn().mockResolvedValue(comment),
    deleteComment: vi.fn().mockResolvedValue(undefined),
  };
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  render(
    <QueryClientProvider client={client}>
      <NodeComments answerId="answer" nodeId="k1" labels={labels} api={api} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { api, onClose };
}
it('focuses the textarea, enforces 300 characters, rejects empty input, and closes with Escape', async () => {
  const { onClose, api } = setup();
  await screen.findByText(labels.empty);
  const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
  expect(document.activeElement).toBe(textarea);
  expect(textarea.maxLength).toBe(300);
  fireEvent.change(textarea, { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: labels.submit }));
  expect(api.addComment).not.toHaveBeenCalled();
  fireEvent.keyDown(textarea, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
});
it('renders comment bodies as text, absolute timestamps, and Delete only for own comments', async () => {
  setup([
    comment,
    { ...comment, id: '00000000-0000-4000-8000-000000000003', mine: false, body: 'Other comment' },
  ]);
  await screen.findByText(comment.body);
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
  expect(document.querySelector('time')!.dateTime).toBe(comment.createdAt);
  expect(document.querySelector('time')!.textContent).toContain('2026');
});
it('saves a trimmed comment and clears input only after success', async () => {
  const { api } = setup();
  await screen.findByText(labels.empty);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Reason  ' } });
  fireEvent.click(screen.getByRole('button', { name: labels.submit }));
  await waitFor(() => expect(api.addComment).toHaveBeenCalled());
  await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(''));
  expect(api.addComment.mock.calls[0]![1]).toEqual({ nodeId: 'k1', body: 'Reason' });
  expect(screen.getByText(labels.saved)).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')));
});

it('returns keyboard focus to the input when the focused comment is deleted', async () => {
  setup([comment]);
  const button = await screen.findByRole('button', { name: 'Delete' });
  button.focus();
  fireEvent.click(button);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')));
});
