import { memo, useId, useEffect, useRef, useState } from 'react';
import { LIMITS } from '@tome/shared';
import { COPY } from '../../../shared/copy';
import { errorCopyKey } from '../../../shared/api';
import { useNodeComments, type NodeCommentsApi } from '../hooks/useNodeComments';
import '../history.css';

export interface NodeCommentLabels {
  title: string;
  submit: string;
  close: string;
  empty: string;
  loading: string;
  saved: string;
}
export interface NodeCommentsProps {
  answerId: string;
  nodeId: string;
  labels: NodeCommentLabels;
  api: NodeCommentsApi;
  onClose: () => void;
}
export const NodeComments = memo(function NodeComments({
  answerId,
  nodeId,
  labels,
  api,
  onClose,
}: NodeCommentsProps) {
  const id = useId();
  const comments = useNodeComments(answerId, nodeId, api);
  const [body, setBody] = useState('');
  const [saved, setSaved] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    textarea.current?.focus({ preventScroll: true });
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (saved && !comments.adding) textarea.current?.focus({ preventScroll: true });
  }, [saved, comments.adding]);
  return (
    <section
      className="canvas-node-comments nodrag nopan nowheel"
      aria-label={labels.title}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <strong>{labels.title}</strong>
        <button type="button" onClick={onClose}>
          {labels.close}
        </button>
      </header>
      <div role="status" aria-live="polite">
        {comments.loading || comments.adding || comments.deleting
          ? labels.loading
          : saved
            ? labels.saved
            : ''}
      </div>
      {comments.error ? (
        <div role="alert">
          {COPY[errorCopyKey(comments.error)]}
          {comments.loadError ? (
            <button type="button" onClick={comments.reload}>
              {COPY['E-01b']}
            </button>
          ) : null}
        </div>
      ) : null}
      {!comments.loading && !comments.error && !comments.comments.length ? (
        <p>{labels.empty}</p>
      ) : null}
      <ol>
        {comments.comments.map((comment) => (
          <li key={comment.id}>
            <strong>{comment.author.displayName}</strong>
            <time dateTime={comment.createdAt}>
              {new Intl.DateTimeFormat(undefined, {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(comment.createdAt))}
            </time>
            <p id={`${id}-${comment.id}`} title={comment.body}>
              {comment.body}
            </p>
            {comment.mine ? (
              <button
                type="button"
                disabled={comments.deleting}
                aria-describedby={`${id}-${comment.id}`}
                onClick={() => {
                  setSaved(false);
                  void comments.remove(comment.id).then((removed) => {
                    if (removed && mounted.current)
                      textarea.current?.focus({ preventScroll: true });
                  });
                }}
              >
                {COPY['S-07b']}
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(false);
          const input = body;
          void comments.submit(input).then((created) => {
            if (created && mounted.current) {
              setBody((current) => (current === input ? '' : current));
              setSaved(true);
            }
          });
        }}
      >
        <label>
          <span>{COPY['S-07a']}</span>
          <textarea
            ref={textarea}
            value={body}
            maxLength={LIMITS.COMMENT_MAX}
            aria-describedby={`${id}-count`}
            disabled={comments.adding}
            onChange={(event) => {
              setBody(event.currentTarget.value);
              setSaved(false);
            }}
          />
        </label>
        <span id={`${id}-count`}>
          {body.length} / {LIMITS.COMMENT_MAX}
        </span>
        <button
          type="submit"
          disabled={
            comments.loading || comments.adding || !body.trim() || body.length > LIMITS.COMMENT_MAX
          }
        >
          {labels.submit}
        </button>
      </form>
    </section>
  );
});
