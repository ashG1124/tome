import { memo, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { LIMITS } from '@tome/shared';
import { COPY } from '../../../shared/copy';
import { errorCopyKey } from '../../../shared/api';
import { BusyMark, Icon } from '../../../shared/ui';
import { useNodeComments, type NodeCommentsApi } from '../hooks/useNodeComments';

export interface NodeCommentLabels {
  /** 코너 버튼 이름 앞머리(Comments) */
  title: string;
  /** 입력칸 이름 */
  input: string;
  /** 펼친 띠의 안내 글(시안 Corner open: Please provide a reason.) */
  placeholder: string;
  /** 입력칸 키 안내(화면 읽기 프로그램용) */
  hint: string;
  loading: string;
  saved: string;
  /** 내 코멘트 지우기 버튼 이름 */
  remove: string;
  /** 지우기 전에 한 번 더 묻는 문장 */
  confirmRemove: string;
  cancel: string;
  removed: string;
}

export interface CommentBandProps {
  answerId: string;
  /** 이 노드(또는 묶음)의 노드 id. 모든 id 의 코멘트를 보이고, 새 코멘트는 첫 id 에 쓴다. */
  nodeIds: readonly string[];
  /** 노드(묶음) 이름. 코너 버튼의 화면 읽기 이름에 붙인다. */
  label: string;
  api: NodeCommentsApi;
  labels: NodeCommentLabels;
  /** 이 노드가 코멘트 대상이다(노드 도구의 코멘트 아이콘을 눌렀거나 코너를 눌렀다). 코멘트가 없어도 코너를 그린다. */
  active: boolean;
  /** 띠가 펼쳐져 입력 중이다(active 일 때만). */
  open: boolean;
  /** 코너를 눌렀다: 이 노드를 대상으로 하고 띠를 펼치거나(true) 접는다(false). */
  onOpenChange: (open: boolean) => void;
  /** 대상을 푼다(코멘트가 없으면 코너도 사라진다). restoreFocus 면 부모가 연 버튼으로 포커스를 돌려준다. */
  onClose: (restoreFocus?: boolean) => void;
}

/** 남은 글자가 이보다 적으면 글자 수를 굵게 보인다. */
const COUNT_WARNING = 20;

/** 절대 날짜·시각(전시 기기 로케일). "6d ago" 같은 상대 표기는 쓰지 않는다. */
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * 노드 오른쪽 아래의 분홍 코멘트 코너와 띠(#241). 시안: Corner 1480:135821(closed·open1·open2), comment & connection 1185:59843.
 * - 닫힘: 코너만. 마우스를 올리면 띠가 펼쳐져 가장 최근 코멘트를 두 줄까지 보인다.
 * - 노드 도구의 코멘트 아이콘을 누르면 코멘트가 없어도 코너가 생기고 코너로 포커스가 간다.
 * - 코너를 누르면 띠가 펼쳐진다. 이전 코멘트(오래된 순)와 내 코멘트 지우기, 그 아래 띠 안 입력칸(안내 Please provide a reason.)이 있다.
 *   펼치면 입력칸으로 포커스가 간다. Enter 로 올리고 Shift+Enter 는 줄바꿈, Esc 는 접고 코너로 포커스를 돌린다.
 * - 올리면 띠가 접히고 코너에 포커스가 남아 방금 쓴 글이 띠에 보인다(저장 완료는 role=status).
 */
export const CommentBand = memo(function CommentBand({
  answerId,
  nodeIds,
  label,
  api,
  labels,
  active,
  open: openProp,
  onOpenChange,
  onClose,
}: CommentBandProps) {
  const id = useId();
  const comments = useNodeComments(answerId, nodeIds, api);
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<'saved' | 'removed'>();
  const [confirming, setConfirming] = useState<string>();
  const corner = useRef<HTMLButtonElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  /** 스스로 접는 동안(입력칸이 사라지며 잃는 포커스)은 띠 밖으로 나간 것으로 보지 않는다. */
  const collapsing = useRef(false);
  const open = active && openProp;
  const count = comments.comments.length;
  const latest = comments.comments[count - 1];

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // 코멘트 아이콘으로 대상이 되면(띠는 닫힌 채) 코너로 포커스를 옮긴다.
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current && !open) corner.current?.focus({ preventScroll: true });
    wasActive.current = active;
  }, [active, open]);
  // 띠를 펼치면 입력칸으로 포커스를 옮긴다.
  useEffect(() => {
    if (open) textarea.current?.focus({ preventScroll: true });
    else setConfirming(undefined);
  }, [open]);
  useEffect(() => {
    if (confirming) cancel.current?.focus({ preventScroll: true });
  }, [confirming]);

  if (!active && count === 0) return null;

  const collapse = (focusCorner: boolean) => {
    collapsing.current = true;
    onOpenChange(false);
    requestAnimationFrame(() => {
      collapsing.current = false;
      if (focusCorner) corner.current?.focus({ preventScroll: true });
    });
  };
  const submit = () => {
    const input = body;
    if (!input.trim() || comments.adding) return;
    setStatus(undefined);
    void comments.submit(input).then((created) => {
      if (!mounted.current) return;
      if (!created) {
        textarea.current?.focus({ preventScroll: true });
        return;
      }
      setBody((current) => (current === input ? '' : current));
      setStatus('saved');
      collapse(true);
    });
  };
  const onTextareaKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 조합 중 Enter 는 글자를 확정할 뿐이다.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };
  const statusText =
    open && comments.loading
      ? labels.loading
      : status === 'saved'
        ? labels.saved
        : status === 'removed'
          ? labels.removed
          : '';
  const remaining = LIMITS.COMMENT_MAX - body.length;

  return (
    <div
      className="canvas-comment-band nodrag nopan nowheel"
      data-expanded={open || undefined}
      data-active={active || undefined}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        if (confirming) {
          const target = confirming;
          setConfirming(undefined);
          requestAnimationFrame(() =>
            document.getElementById(`${id}-remove-${target}`)?.focus({ preventScroll: true }),
          );
          return;
        }
        if (open) {
          setBody('');
          collapse(true);
          return;
        }
        // 닫힌 코너에서 Esc: 대상을 푼다(코멘트가 없으면 코너가 사라지고 포커스는 코멘트 아이콘으로 간다).
        onClose();
      }}
      onBlur={(event) => {
        // 코너·띠 밖으로 포커스가 나가면 대상을 푼다(코멘트가 없으면 코너도 사라진다). 쓰던 글이 있으면 띠만 접고
        // 대상은 남겨 글을 지킨다. 창 전환으로 잃은 포커스는 그대로 둔다.
        if (!active || collapsing.current || !document.hasFocus()) return;
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        if (body.trim()) {
          if (open) onOpenChange(false);
        } else onClose(false);
      }}
    >
      <button
        ref={corner}
        type="button"
        className="canvas-comment-corner"
        aria-label={`${labels.title}${count ? ` (${count})` : ''}: ${label}`}
        aria-expanded={open}
        aria-describedby={latest && !open ? `${id}-latest` : undefined}
        onClick={() => {
          setStatus(undefined);
          onOpenChange(!open);
        }}
      />
      {!open && latest ? (
        <p className="canvas-comment-text" id={`${id}-latest`}>
          <span>{latest.body}</span>
          {count > 1 ? (
            <span className="canvas-comment-total" aria-hidden="true">
              {count}
            </span>
          ) : null}
        </p>
      ) : null}
      {open ? (
        <div
          className="canvas-comment-sheet"
          role="group"
          aria-label={`${labels.title}: ${label}`}
          tabIndex={-1}
        >
          {comments.loadError ? (
            <p className="canvas-comment-alert" role="alert">
              <Icon name="warning" size={20} />
              <span>{COPY[errorCopyKey(comments.loadError)]}</span>
              <button type="button" className="canvas-comment-pill" onClick={comments.reload}>
                {COPY['E-01b']}
              </button>
            </p>
          ) : null}
          {comments.removeError ? (
            <p className="canvas-comment-alert" role="alert">
              <Icon name="warning" size={20} />
              <span>{COPY[errorCopyKey(comments.removeError)]}</span>
            </p>
          ) : null}
          {count > 0 ? (
            <ol className="canvas-comment-thread">
              {comments.comments.map((comment) => {
                const asking = confirming === comment.id;
                const removing = comments.removingId === comment.id;
                return (
                  <li key={comment.id} className="canvas-comment-entry">
                    <p id={`${id}-${comment.id}`} className="canvas-comment-body">
                      {comment.body}
                    </p>
                    <div className="canvas-comment-meta">
                      <span>{comment.author.displayName}</span>
                      <time dateTime={comment.createdAt}>
                        {dateFormat.format(new Date(comment.createdAt))}
                      </time>
                      {comment.mine ? (
                        <button
                          id={`${id}-remove-${comment.id}`}
                          type="button"
                          className="canvas-comment-icon"
                          aria-label={labels.remove}
                          aria-describedby={`${id}-${comment.id}`}
                          aria-expanded={asking}
                          disabled={comments.deleting}
                          onClick={() => {
                            setStatus(undefined);
                            setConfirming(asking ? undefined : comment.id);
                          }}
                        >
                          <Icon name="trash-can" size={20} />
                        </button>
                      ) : null}
                    </div>
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
                          className="canvas-comment-pill"
                          disabled={removing}
                          onClick={() => setConfirming(undefined)}
                        >
                          {labels.cancel}
                        </button>
                        <button
                          type="button"
                          className="canvas-comment-pill"
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
          <label className="canvas-sr-only" htmlFor={`${id}-input`}>
            {`${labels.input}: ${label}`}
          </label>
          <textarea
            id={`${id}-input`}
            ref={textarea}
            className="canvas-comment-input"
            value={body}
            rows={1}
            placeholder={labels.placeholder}
            maxLength={LIMITS.COMMENT_MAX}
            readOnly={comments.adding}
            aria-busy={comments.adding || undefined}
            aria-describedby={`${id}-hint ${id}-count`}
            aria-invalid={comments.addError ? true : undefined}
            onChange={(event) => {
              setBody(event.currentTarget.value);
              setStatus(undefined);
            }}
            onKeyDown={onTextareaKey}
          />
          <span id={`${id}-hint`} className="canvas-sr-only">
            {labels.hint}
          </span>
          <span
            id={`${id}-count`}
            className="canvas-comment-count"
            data-empty={body.length === 0 || undefined}
            data-warning={remaining <= COUNT_WARNING || undefined}
          >
            {body.length} / {LIMITS.COMMENT_MAX}
          </span>
          {comments.addError ? (
            <p className="canvas-comment-alert" role="alert">
              <Icon name="warning" size={20} />
              <span>{COPY[errorCopyKey(comments.addError)]}</span>
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="canvas-sr-only" role="status" aria-live="polite">
        {statusText}
      </p>
    </div>
  );
});
