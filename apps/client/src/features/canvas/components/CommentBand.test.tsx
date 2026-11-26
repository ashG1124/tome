import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { NodeComment } from '@tome/shared';
import { CommentBand, type NodeCommentLabels } from './CommentBand';
afterEach(cleanup);

const labels: NodeCommentLabels = {
  title: 'Comments',
  input: 'Add a comment',
  placeholder: 'Please provide a reason.',
  hint: 'Press Enter to post.',
  loading: 'Loading',
  saved: 'Saved',
  remove: 'Delete',
  confirmRemove: 'Delete this comment?',
  cancel: 'Cancel',
  removed: 'Deleted',
};
const author = {
  id: '00000000-0000-4000-8000-000000000002',
  kind: 'visitor' as const,
  displayName: 'Visitor',
  bio: null,
  avatarUrl: null,
};
const comment = (id: number, nodeId: string, body: string, mine = true): NodeComment => ({
  id: `00000000-0000-4000-8000-00000000010${id}`,
  nodeId,
  body,
  mine,
  createdAt: `2026-11-19T00:00:0${id}Z`,
  author,
});

/** 부모(WorkspaceCanvas)처럼 대상·펼침 상태를 들고 띠를 그린다. */
function setup(
  comments: NodeComment[] = [],
  { active = false, nodeIds = ['v1', 'v2'] }: { active?: boolean; nodeIds?: string[] } = {},
) {
  const api = {
    listComments: vi.fn(() => Promise.resolve(comments)),
    addComment: vi.fn((_answer: string, body: { nodeId: string; body: string }) =>
      Promise.resolve(comment(9, body.nodeId, body.body)),
    ),
    deleteComment: vi.fn(() => Promise.resolve()),
  };
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  let activate!: () => void;
  function Harness() {
    const [state, setState] = useState({ active, open: false });
    activate = () => setState({ active: true, open: false });
    return (
      <>
        <button type="button">outside</button>
        <CommentBand
          answerId="answer"
          nodeIds={nodeIds}
          label="Verification criteria"
          api={api}
          labels={labels}
          active={state.active}
          open={state.open}
          onOpenChange={(open) => setState({ active: true, open })}
          onClose={(restore) => {
            onClose(restore);
            setState({ active: false, open: false });
          }}
        />
      </>
    );
  }
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  return { api, onClose, activate: () => act(() => activate()) };
}

const corner = () => screen.getByRole('button', { name: /^Comments/ });

it('draws nothing without comments until the node tool makes it the target, then focuses the corner', async () => {
  const { api, activate } = setup();
  await waitFor(() => expect(api.listComments).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: /^Comments/ })).toBeNull();
  activate();
  expect(corner()).toHaveProperty('ariaExpanded', 'false');
  await waitFor(() => expect(document.activeElement).toBe(corner()));
});

it('opens the band with the Figma guide, posts with Enter on the first row id and returns focus to the corner', async () => {
  const { api } = setup([], { active: true });
  await waitFor(() => expect(api.listComments).toHaveBeenCalled());
  fireEvent.click(corner());
  const input = screen.getByRole('textbox', { name: 'Add a comment: Verification criteria' });
  expect(input.getAttribute('placeholder')).toBe('Please provide a reason.');
  expect(input.getAttribute('maxlength')).toBe('300');
  await waitFor(() => expect(document.activeElement).toBe(input));
  // 빈 글·공백은 올리지 않고, Shift+Enter 는 줄바꿈(기본 동작)이다.
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.change(input, { target: { value: '  ' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(api.addComment).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: 'Light first' } });
  expect(fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })).toBe(true);
  // 한글 조합 중 Enter 는 올리지 않는다.
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(api.addComment).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(api.addComment).toHaveBeenCalledOnce());
  expect(api.addComment.mock.calls[0]![1]).toEqual({ nodeId: 'v1', body: 'Light first' });
  await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  expect(screen.getByRole('status').textContent).toBe('Saved');
  // 접힌 띠는 방금 쓴 글을 보인다(코너의 설명).
  expect(screen.getByText('Light first')).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(corner()));
});

it('marks the character count for display only near the limit, but always describes the input with it (#252)', async () => {
  const { api } = setup([], { active: true });
  await waitFor(() => expect(api.listComments).toHaveBeenCalled());
  fireEvent.click(corner());
  const input = screen.getByRole('textbox');
  const count = () => {
    const ids = input.getAttribute('aria-describedby')!.split(' ');
    return document.getElementById(ids[ids.length - 1]!)!;
  };
  fireEvent.change(input, { target: { value: 'Light first' } });
  expect(count().textContent).toBe('11 / 300');
  expect(count().hasAttribute('data-warning')).toBe(false);
  fireEvent.change(input, { target: { value: 'A'.repeat(279) } });
  expect(count().hasAttribute('data-warning')).toBe(false);
  fireEvent.change(input, { target: { value: 'A'.repeat(280) } });
  expect(count().hasAttribute('data-warning')).toBe(true);
  expect(count().textContent).toBe('280 / 300');
});

it('Escape collapses to the corner, then releases the target from the corner', async () => {
  const { api, onClose } = setup([], { active: true });
  await waitFor(() => expect(api.listComments).toHaveBeenCalled());
  fireEvent.click(corner());
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: 'draft' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('textbox')).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(corner()));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.keyDown(corner(), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledWith(undefined);
  // 코멘트가 없으면 코너도 사라진다.
  expect(screen.queryByRole('button', { name: /^Comments/ })).toBeNull();
});

it('shows every comment of the group, oldest first, and the latest on the closed band', async () => {
  const { api } = setup([
    comment(1, 'v2', 'Older on second row'),
    comment(2, 'v1', 'Newest on first row', false),
    comment(3, 'k1', 'Other node'),
  ]);
  await waitFor(() =>
    expect(corner().getAttribute('aria-label')).toBe('Comments (2): Verification criteria'),
  );
  expect(screen.getByText('Newest on first row')).toBeTruthy();
  expect(screen.queryByText('Other node')).toBeNull();
  fireEvent.click(corner());
  const group = screen.getByRole('group', { name: 'Comments: Verification criteria' });
  const items = within(group).getAllByRole('listitem');
  expect(items.map((item) => item.querySelector('p')?.textContent)).toEqual([
    'Older on second row',
    'Newest on first row',
  ]);
  // 지우기는 내 코멘트에만 있다.
  expect(within(items[0]!).getByRole('button', { name: 'Delete' })).toBeTruthy();
  expect(within(items[1]!).queryByRole('button', { name: 'Delete' })).toBeNull();
  // 날짜는 절대 표기다.
  expect(items[0]!.querySelector('time')?.getAttribute('dateTime')).toBe('2026-11-19T00:00:01Z');
  expect(api.listComments).toHaveBeenCalledOnce();
});

it('asks before deleting an own comment; Escape only closes the question', async () => {
  const own = comment(1, 'v1', 'Mine');
  const { api } = setup([own], { active: true });
  await waitFor(() => expect(corner().getAttribute('aria-label')).toContain('(1)'));
  fireEvent.click(corner());
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  const ask = screen.getByRole('group', { name: 'Delete this comment?' });
  await waitFor(() =>
    expect(document.activeElement).toBe(within(ask).getByRole('button', { name: 'Cancel' })),
  );
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(screen.queryByRole('group', { name: 'Delete this comment?' })).toBeNull();
  expect(screen.getByRole('textbox')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Delete this comment?' })).getByRole('button', {
      name: 'Delete',
    }),
  );
  await waitFor(() => expect(api.deleteComment).toHaveBeenCalledWith(own.id));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Deleted'));
  expect(screen.queryByText('Mine')).toBeNull();
});

it('shows a save failure as an alert and keeps the text', async () => {
  const { api } = setup([], { active: true });
  api.addComment.mockRejectedValueOnce(new Error('offline'));
  await waitFor(() => expect(api.listComments).toHaveBeenCalled());
  fireEvent.click(corner());
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: 'Keep me' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Keep me');
});

it('leaving the band releases an empty target but keeps a draft', async () => {
  const { api, onClose } = setup([], { active: true });
  await waitFor(() => expect(api.listComments).toHaveBeenCalled());
  fireEvent.click(corner());
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: 'half' } });
  const outside = screen.getByRole('button', { name: 'outside' });
  fireEvent.blur(input, { relatedTarget: outside });
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(corner());
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('half');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
  fireEvent.blur(screen.getByRole('textbox'), { relatedTarget: outside });
  expect(onClose).toHaveBeenCalledWith(false);
});

it('renders comment bodies as text', async () => {
  setup([comment(1, 'v1', '<img src=x onerror=alert(1)>')]);
  expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  expect(document.querySelector('img')).toBeNull();
});
