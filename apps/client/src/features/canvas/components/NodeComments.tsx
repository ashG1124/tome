import { memo, useEffect, useId, useRef, useState } from 'react';
import { LIMITS } from '@tome/shared';
import { COPY } from '../../../shared/copy';
import { errorCopyKey } from '../../../shared/api';
import { BusyMark, Button, ErrorNotice, Icon } from '../../../shared/ui';
import { useNodeComments, type NodeCommentsApi } from '../hooks/useNodeComments';
import '../history.css';

export interface NodeCommentLabels {
  title: string;
  /** 입력칸 이름(안내 글) */
  input: string;
  submit: string;
  close: string;
  empty: string;
  loading: string;
  saved: string;
  /** 내 코멘트 지우기 버튼 이름 */
  remove: string;
  /** 지우기 전에 한 번 더 묻는 문장 */
  confirmRemove: string;
  cancel: string;
  removed: string;
}
export interface NodeCommentsProps {
  answerId: string;
  nodeId: string;
  labels: NodeCommentLabels;
  api: NodeCommentsApi;
  onClose: () => void;
}

/** 이 시간 안에 끝나는 불러오기는 표시하지 않는다(깜빡임 방지, 공통 규칙). */
const LOADING_DELAY_MS = 300;
/** 남은 글자가 이보다 적으면 글자 수를 강조한다. */
const COUNT_WARNING = 20;

/** 창이 아이콘으로 접히는 움직임 시간(ms). 토큰 --motion-expand 를 읽고, 움직임 줄이기 설정이면 0 이다. */
function closeDuration(): number {
  if (typeof window === 'undefined') return 0;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 0;
  const value = getComputedStyle(document.documentElement).getPropertyValue('--motion-expand');
  return Number.parseFloat(value) || 0;
}

/** 절대 날짜·시각(전시 기기 로케일). "6d ago" 같은 상대 표기는 쓰지 않는다. */
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * 노드 코멘트 창. 노드 도구의 코멘트 아이콘이 그 자리에서 넓어지며 열린다(#230, 노드 안에 그려져 캔버스와 함께 움직인다).
 * 창 왼쪽 위의 코멘트 아이콘은 도구 아이콘과 같은 자리에 있고, 누르면 창이 다시 아이콘으로 접힌다.
 * 열리면 입력칸에 포커스가 가고, Esc 나 아이콘으로 접으면 연 버튼으로 포커스가 돌아간다(부모가 처리).
 * 내 코멘트 삭제는 한 번 더 묻고 지운다(서버에 되살리기가 없어서).
 */
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
  const [status, setStatus] = useState<'saved' | 'removed'>();
  const [confirming, setConfirming] = useState<string>();
  const [closing, setClosing] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  /** 확인을 접은 뒤 포커스를 돌려줄 지우기 버튼 */
  const returnTo = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  const closeRef = useRef(onClose);
  const closeTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    mounted.current = true;
    textarea.current?.focus({ preventScroll: true });
    return () => {
      mounted.current = false;
      window.clearTimeout(closeTimer.current);
    };
  }, []);
  // 목록은 오래된 순이다. 처음 열 때와 새 코멘트가 붙을 때 맨 아래(최신)로 내린다.
  const list = useRef<HTMLOListElement>(null);
  const seen = useRef(0);
  const count = comments.comments.length;
  useEffect(() => {
    const element = list.current;
    if (element && count > seen.current) {
      const instant =
        seen.current === 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      element.scrollTo?.({ top: element.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
    }
    seen.current = count;
  }, [count]);
  useEffect(() => {
    if (!comments.loading) return;
    const timer = window.setTimeout(() => setShowLoading(true), LOADING_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      setShowLoading(false);
    };
  }, [comments.loading]);
  useEffect(() => {
    if (confirming) {
      cancel.current?.focus({ preventScroll: true });
      return;
    }
    const target = returnTo.current;
    returnTo.current = undefined;
    if (target) removeButtons.current.get(target)?.focus({ preventScroll: true });
  }, [confirming]);

  const requestClose = () => {
    if (closing) return;
    const duration = closeDuration();
    if (duration <= 0) {
      closeRef.current();
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(() => closeRef.current(), duration);
  };
  const stopConfirm = () => {
    returnTo.current = confirming;
    setConfirming(undefined);
  };
  const loading = comments.loading && showLoading;
  const remaining = LIMITS.COMMENT_MAX - body.length;
  const statusText = loading
    ? labels.loading
    : status === 'saved'
      ? labels.saved
      : status === 'removed'
        ? labels.removed
        : '';

  return (
    <section
      className="canvas-comments nodrag nopan nowheel"
      data-closing={closing || undefined}
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        if (confirming) stopConfirm();
        else requestClose();
      }}
    >
      <header className="canvas-comments-head">
        <button
          type="button"
          className="canvas-comments-toggle"
          aria-label={labels.close}
          data-active=""
          onClick={requestClose}
        >
          <Icon name="comment" size={24} />
        </button>
        <h2 id={`${id}-title`}>{labels.title}</h2>
        {count > 0 ? (
          <span className="canvas-comments-total" aria-hidden="true">
            {count}
          </span>
        ) : null}
      </header>

      <div className="canvas-comments-body">
        {comments.loadError ? (
          <ErrorNotice message={COPY[errorCopyKey(comments.loadError)]} onRetry={comments.reload} />
        ) : null}
        {comments.removeError ? (
          <ErrorNotice message={COPY[errorCopyKey(comments.removeError)]} />
        ) : null}
        {loading ? (
          <div className="canvas-comments-skeleton" aria-hidden="true">
            <span />
            <span />
          </div>
        ) : null}
        {!comments.loading && !comments.loadError && count === 0 ? (
          <div className="canvas-comments-empty">
            <Icon name="comment" size={32} />
            <p>{labels.empty}</p>
          </div>
        ) : null}
        {count > 0 ? (
          <ol ref={list} className="canvas-comments-list">
            {comments.comments.map((comment) => {
              const asking = confirming === comment.id;
              const removing = comments.removingId === comment.id;
              return (
                <li
                  key={comment.id}
                  className="canvas-comment"
                  data-mine={comment.mine || undefined}
                  data-confirming={asking || undefined}
                >
                  <div className="canvas-comment-meta">
                    <strong>{comment.author.displayName}</strong>
                    <time dateTime={comment.createdAt}>
                      {dateFormat.format(new Date(comment.createdAt))}
                    </time>
                    {comment.mine ? (
                      <button
                        ref={(element) => {
                          if (element) removeButtons.current.set(comment.id, element);
                          else removeButtons.current.delete(comment.id);
                        }}
                        type="button"
                        className="canvas-comments-icon"
                        aria-label={labels.remove}
                        aria-describedby={`${id}-${comment.id}`}
                        aria-expanded={asking}
                        data-active={asking || undefined}
                        disabled={comments.deleting}
                        onClick={() => {
                          setStatus(undefined);
                          if (asking) stopConfirm();
                          else setConfirming(comment.id);
                        }}
                      >
                        <Icon name="trash-can" size={20} />
                      </button>
                    ) : null}
                  </div>
                  <p id={`${id}-${comment.id}`} className="canvas-comment-message">
                    {comment.body}
                  </p>
                  {asking ? (
                    <div
                      className="canvas-comment-confirm"
                      role="group"
                      aria-labelledby={`${id}-${comment.id}-ask`}
                    >
                      <span id={`${id}-${comment.id}-ask`}>{labels.confirmRemove}</span>
                      <button
                        ref={cancel}
                        type="button"
                        className="canvas-comments-pill"
                        disabled={removing}
                        onClick={stopConfirm}
                      >
                        {labels.cancel}
                      </button>
                      <button
                        type="button"
                        className="canvas-comments-pill"
                        data-strong=""
                        disabled={removing}
                        aria-busy={removing || undefined}
                        onClick={() => {
                          void comments.remove(comment.id).then((removed) => {
                            if (!removed || !mounted.current) return;
                            setConfirming(undefined);
                            setStatus('removed');
                            textarea.current?.focus({ preventScroll: true });
                          });
                        }}
                      >
                        {labels.remove}
                        <BusyMark busy={removing} />
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>

      <form
        className="canvas-comments-compose"
        data-error={comments.addError ? true : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          setStatus(undefined);
          const input = body;
          void comments.submit(input).then((created) => {
            if (!mounted.current) return;
            if (created) {
              setBody((current) => (current === input ? '' : current));
              setStatus('saved');
            }
            // 저장이 끝나면(성공·실패 모두) 입력칸으로 포커스를 돌려준다. 저장 중에는 입력칸이 잠겨 포커스를 잃는다.
            requestAnimationFrame(() => textarea.current?.focus({ preventScroll: true }));
          });
        }}
      >
        <label className="canvas-sr-only" htmlFor={`${id}-input`}>
          {labels.input}
        </label>
        <div className="canvas-comments-field">
          <textarea
            id={`${id}-input`}
            ref={textarea}
            value={body}
            rows={2}
            placeholder={labels.input}
            maxLength={LIMITS.COMMENT_MAX}
            aria-describedby={`${id}-count`}
            aria-invalid={comments.addError ? true : undefined}
            disabled={comments.adding}
            onChange={(event) => {
              setBody(event.currentTarget.value);
              setStatus(undefined);
            }}
            onKeyDown={(event) => {
              // Ctrl/⌘+Enter 로도 저장한다. Enter 만 누르면 줄바꿈이다.
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="canvas-comments-footer">
            <span
              id={`${id}-count`}
              className="canvas-comments-count"
              data-warning={remaining <= COUNT_WARNING || undefined}
            >
              {body.length} / {LIMITS.COMMENT_MAX}
            </span>
            <p className="canvas-comments-status" role="status" aria-live="polite">
              {statusText}
            </p>
            <Button
              type="submit"
              className="canvas-comments-submit"
              busy={comments.adding}
              disabled={comments.loading || !body.trim() || remaining < 0}
            >
              {labels.submit}
            </Button>
          </div>
        </div>
        {comments.addError ? <ErrorNotice message={COPY[errorCopyKey(comments.addError)]} /> : null}
      </form>
    </section>
  );
});
