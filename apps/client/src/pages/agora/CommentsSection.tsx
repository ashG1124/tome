import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LIMITS, type Id } from '@tome/shared';
import { useId, useState, type FormEvent } from 'react';
import { api, errorCopyKey } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { Button, ErrorNotice } from '../../shared/ui';
import { canDeleteComment, checkCommentBody, formatCommentDate } from './agora';
import { AuthorAvatar } from './AuthorAvatar';

/** 처음에 보이는 댓글 수. 시안처럼 1개만 보이고 See more 로 모두 펼친다. */
export const COMMENT_PREVIEW_COUNT = 1;

interface CommentsSectionProps {
  projectId: Id;
  /** 상세 응답의 댓글 수(제목 옆 괄호) */
  count: number;
  /** 테스트에서 날짜 형식을 고정할 때만 넘긴다 */
  locale?: string;
  timeZone?: string;
}

/**
 * 프로젝트 상세의 댓글(3099:130760): 제목 "Comments (n)", See more, 댓글 카드, 입력칸.
 * 입력칸이 300자에서 멈추고, 빈 글(공백만)은 보내지 않는다. 쓰기와 내 댓글 지우기만 한다(신고·차단 없음). 보내다 실패하면 입력한 글은 그대로 남는다. 시각은 절대 날짜.
 */
export function CommentsSection({ projectId, count, locale, timeZone }: CommentsSectionProps) {
  const queryClient = useQueryClient();
  const queryKey = ['agora-comments', projectId];
  const comments = useQuery({ queryKey, queryFn: () => api.listComments(projectId) });
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const inputId = useId();

  const create = useMutation({
    mutationFn: (body: string) => api.createComment(projectId, { body }),
    onSuccess: () => {
      setText('');
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  const remove = useMutation({
    mutationFn: (commentId: Id) => api.deleteComment(commentId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (create.isPending) return;
    const check = checkCommentBody(text);
    if (check.ok) create.mutate(check.body);
  };

  const list = comments.data?.comments ?? [];
  const shown = expanded ? list : list.slice(0, COMMENT_PREVIEW_COUNT);
  const error = create.error ?? remove.error ?? comments.error;

  return (
    <section
      aria-labelledby={`${inputId}-title`}
      className="flex flex-col gap-[var(--space-gap-5)]"
    >
      <div className="flex items-baseline justify-between">
        <h2
          id={`${inputId}-title`}
          className="m-0 [font:var(--text-heading-h1)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-strong)]"
        >
          {COPY['A-02']}{' '}
          <span className="[font:var(--text-subtitle-st1-m)] text-[color:var(--color-font-sub-text)]">
            ({count})
          </span>
        </h2>
        {list.length > COMMENT_PREVIEW_COUNT && !expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="cursor-pointer border-0 bg-transparent p-0 [font:var(--text-body-b2-r)] text-[color:var(--color-font-sub-text)] underline"
          >
            {COPY['A-03']}
          </button>
        ) : null}
      </div>
      {error ? <ErrorNotice message={COPY[errorCopyKey(error)]} /> : null}
      {shown.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-[var(--space-padding-3)] p-0">
          {shown.map((comment) => (
            <li
              key={comment.id}
              className="flex gap-[var(--space-gap-4)] rounded-[var(--radius-node)] bg-[color:var(--color-fill-neutral-weak)] p-[var(--space-padding-8)]"
            >
              <AuthorAvatar
                creator={comment.author}
                sizeClass="size-[var(--size-avatar-comment)]"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-padding-2)]">
                <p className="m-0 flex items-baseline gap-[var(--space-padding-3)]">
                  <span className="[font:var(--text-subtitle-st2-m)] tracking-[var(--letter-spacing-subtitle-st2)] text-[color:var(--color-font-strong)]">
                    {comment.author.displayName}
                  </span>
                  <time
                    dateTime={comment.createdAt}
                    className="[font:var(--text-body-b2-r)] text-[color:var(--color-font-helper-text)]"
                  >
                    {formatCommentDate(comment.createdAt, locale, timeZone)}
                  </time>
                </p>
                <p className="m-0 [font:var(--text-body-b1-r)] break-words text-[color:var(--color-font-sub-text)]">
                  {comment.body}
                </p>
              </div>
              {canDeleteComment(comment) ? (
                <Button
                  onClick={() => remove.mutate(comment.id)}
                  busy={remove.isPending && remove.variables === comment.id}
                  className="self-start"
                >
                  {COPY['S-07b']}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : comments.isSuccess ? (
        <p role="status" className="m-0 text-[color:var(--color-font-sub-text)]">
          {COPY['S-02']}
        </p>
      ) : null}
      <form onSubmit={submit} className="flex items-start gap-[var(--space-gap-4)]">
        <label htmlFor={inputId} className="sr-only">
          {COPY['S-07a']}
        </label>
        <textarea
          id={inputId}
          rows={2}
          value={text}
          maxLength={LIMITS.COMMENT_MAX}
          placeholder={COPY['S-07a']}
          onChange={(event) => setText(event.target.value)}
          className={[
            'box-border min-w-0 flex-1 resize-none rounded-[var(--radius-input)] border border-solid',
            'border-[length:var(--stroke-weight-light)] border-[color:var(--color-border-input)]',
            'bg-[color:var(--color-background-default)] p-[var(--space-padding-5)]',
            '[font:var(--text-body-b1-r)] text-[color:var(--color-font-main-text)]',
            'placeholder:text-[color:var(--color-font-helper-text)]',
          ].join(' ')}
        />
        <Button type="submit" busy={create.isPending} disabled={text.trim() === ''}>
          {COPY['A-08']}
        </Button>
      </form>
    </section>
  );
}
