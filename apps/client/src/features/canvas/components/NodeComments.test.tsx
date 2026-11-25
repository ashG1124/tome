import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { NodeComment } from '@tome/shared';
import { NodeComments } from './NodeComments';
afterEach(cleanup);
const labels = {
  title: 'Node comments',
  input: 'Write a comment',
  submit: 'Post',
  close: 'Close',
  empty: 'No comments',
  loading: 'Loading',
  saved: 'Saved',
  remove: 'Delete',
  confirmRemove: 'Delete this comment?',
  cancel: 'Cancel',
  removed: 'Deleted',
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
function setup(
  comments: NodeComment[] = [],
  overrides: Partial<{
    listComments: () => Promise<NodeComment[]>;
    deleteComment: () => Promise<void>;
  }> = {},
) {
  const api = {
    listComments: vi.fn(overrides.listComments ?? (() => Promise.resolve(comments))),
    addComment: vi.fn().mockResolvedValue(comment),
    deleteComment: vi.fn(overrides.deleteComment ?? (() => Promise.resolve())),
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
  expect(screen.getByRole('region', { name: labels.title })).toBeTruthy();
  const textarea = screen.getByRole('textbox', { name: labels.input }) as HTMLTextAreaElement;
  expect(document.activeElement).toBe(textarea);
  expect(textarea.maxLength).toBe(300);
  fireEvent.change(textarea, { target: { value: '   ' } });
  expect(screen.getByText('3 / 300')).toBeTruthy();
  expect((screen.getByRole('button', { name: labels.submit }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.submit(textarea.form!);
  expect(api.addComment).not.toHaveBeenCalled();
  fireEvent.keyDown(textarea, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
});
it('collapses back from the comment icon it grew out of (#230)', async () => {
  const { onClose } = setup();
  const toggle = await screen.findByRole('button', { name: labels.close });
  // 창 왼쪽 위의 버튼은 노드 도구의 코멘트 아이콘(선택 상태)이다. 따로 닫기(X) 버튼은 없다.
  expect(toggle.className).toContain('canvas-comments-toggle');
  expect(toggle.querySelector('[data-icon="comment"]')).not.toBeNull();
  expect(document.querySelector('[data-icon="close"]')).toBeNull();
  fireEvent.click(toggle);
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
  const time = document.querySelector('time')!;
  expect(time.dateTime).toBe(comment.createdAt);
  expect(time.textContent).toContain('2026');
  expect(time.textContent).not.toMatch(/ago/);
});
it('saves a trimmed comment and clears input only after success', async () => {
  const { api } = setup();
  await screen.findByText(labels.empty);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Reason  ' } });
  fireEvent.click(screen.getByRole('button', { name: labels.submit }));
  await waitFor(() => expect(api.addComment).toHaveBeenCalled());
  await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(''));
  expect(api.addComment.mock.calls[0]![1]).toEqual({ nodeId: 'k1', body: 'Reason' });
  expect(screen.getByRole('status').textContent).toBe(labels.saved);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')));
});
it('saves with Ctrl+Enter and keeps Enter for new lines', async () => {
  const { api } = setup();
  await screen.findByText(labels.empty);
  const textarea = screen.getByRole('textbox');
  fireEvent.change(textarea, { target: { value: 'Line' } });
  fireEvent.keyDown(textarea, { key: 'Enter' });
  expect(api.addComment).not.toHaveBeenCalled();
  fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
  await waitFor(() => expect(api.addComment).toHaveBeenCalledOnce());
});

it('asks before deleting, then deletes and returns focus to the input', async () => {
  const { api } = setup([comment]);
  const button = await screen.findByRole('button', { name: 'Delete' });
  button.focus();
  fireEvent.click(button);
  expect(api.deleteComment).not.toHaveBeenCalled();
  const ask = screen.getByRole('group', { name: labels.confirmRemove });
  await waitFor(() =>
    expect(document.activeElement).toBe(within(ask).getByRole('button', { name: labels.cancel })),
  );
  fireEvent.click(within(ask).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(api.deleteComment).toHaveBeenCalledWith(comment.id));
  await waitFor(() => expect(screen.queryByText(comment.body)).toBeNull());
  expect(screen.getByRole('status').textContent).toBe(labels.removed);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')));
});

it('Cancel and Escape close the question without deleting or closing the panel', async () => {
  const { api, onClose } = setup([comment]);
  const button = await screen.findByRole('button', { name: 'Delete' });
  fireEvent.click(button);
  fireEvent.click(screen.getByRole('button', { name: labels.cancel }));
  expect(screen.queryByRole('group', { name: labels.confirmRemove })).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(button));
  fireEvent.click(button);
  fireEvent.keyDown(screen.getByRole('button', { name: labels.cancel }), { key: 'Escape' });
  expect(screen.queryByRole('group', { name: labels.confirmRemove })).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
  expect(api.deleteComment).not.toHaveBeenCalled();
});

it('shows a load failure as an alert with Retry', async () => {
  let fail = true;
  const { api } = setup([], {
    listComments: () => (fail ? Promise.reject(new Error('offline')) : Promise.resolve([comment])),
  });
  const alert = await screen.findByRole('alert');
  fail = false;
  fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
  await screen.findByText(comment.body);
  expect(api.listComments).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('keeps the question open and shows an alert when deleting fails', async () => {
  setup([comment], { deleteComment: () => Promise.reject(new Error('offline')) });
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  const ask = screen.getByRole('group', { name: labels.confirmRemove });
  fireEvent.click(within(ask).getByRole('button', { name: 'Delete' }));
  await screen.findByRole('alert');
  expect(screen.getByText(comment.body)).toBeTruthy();
  expect(screen.getByRole('group', { name: labels.confirmRemove })).toBeTruthy();
});
