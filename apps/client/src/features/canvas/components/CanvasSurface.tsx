import { useRef, useState, type ReactNode, type ComponentPropsWithoutRef } from 'react';
import type { CardData } from '../model';
import { CANVAS_COPY, COPY } from '../../../shared/copy';
import { useApiImage } from '../../../shared/api';
import { Icon } from '../../../shared/ui';

function AnswerImage({ url, label }: { url: string; label: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const { directSrc, failed } = useApiImage(url, imageRef);
  const [broken, setBroken] = useState(false);
  const unavailable = failed || broken;
  return (
    <>
      <img
        ref={imageRef}
        src={directSrc}
        className="canvas-image"
        alt={label}
        hidden={unavailable}
        onError={() => setBroken(true)}
      />
      {unavailable ? (
        <div className="canvas-error" role="status">
          {COPY['E-01a']}
        </div>
      ) : null}
    </>
  );
}

/** 원작 답변 카드. 원작 그림 위에 흐림 오버레이를 덮은 읽기 전용 카드다(시안 Work Space-Derive 1679:15197). */
function OriginAnswer({ data }: { data: CardData }) {
  const origin = data.origin;
  const answer = origin?.answer;
  const deleted = !origin || origin.title === null || origin.creator === null;
  return (
    <div className="canvas-image-slot canvas-origin-slot" data-empty={!answer || undefined}>
      {answer && !deleted ? (
        <>
          <AnswerImage key={answer.imageUrl} url={answer.imageUrl} label={data.label} />
          <span className="canvas-answer-chip">{data.labels.answer(answer.number)}</span>
        </>
      ) : null}
      {deleted ? (
        <p className="canvas-origin-deleted" role="status">
          {data.label}
        </p>
      ) : null}
      <span className="canvas-origin-veil" aria-hidden="true" />
    </div>
  );
}

export function GenerationImage({ generating = true }: { generating?: boolean }) {
  return (
    <div
      className={`canvas-image-slot${generating ? ' canvas-gradient' : ''}`}
      role="img"
      aria-label={generating ? CANVAS_COPY.generating : CANVAS_COPY.pending}
    />
  );
}

export function CanvasSurface({
  data,
  children,
  answerFooter,
  open = false,
  covered = false,
  enabled: enabledOverride,
  ...rest
}: {
  data: CardData;
  answerFooter?: ReactNode;
  /** 제자리에서 펼친 노드. 닫힌 글 대신 편집 화면 자리(children)만 그린다. */
  open?: boolean;
  /** 같은 묶음의 다른 줄이 펼쳐져 이 줄을 대신 덮는다(검색 우선순위). */
  covered?: boolean;
  /** Apply 전 고친 켜짐 값. 없으면 답변의 값 */
  enabled?: boolean;
} & ComponentPropsWithoutRef<'article'>) {
  const enabled = enabledOverride ?? data.output?.enabled;
  const lock = useRef(false);
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    if (lock.current || !data.onRetry) return;
    lock.current = true;
    setRetrying(true);
    try {
      await data.onRetry();
    } finally {
      lock.current = false;
      setRetrying(false);
    }
  };
  const pending = data.state === 'pending' || data.state === 'running';
  const outputKind = data.output?.kind;
  const row = outputKind === 'priority' || outputKind === 'criterion';
  const modifiers = [
    outputKind ? `canvas-card--${outputKind}` : '',
    row ? 'canvas-card--row' : '',
    row && data.groupPosition ? `canvas-card--${data.groupPosition}` : '',
    data.error ? 'canvas-card--error' : '',
    open ? 'canvas-card--open' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <article
      {...rest}
      className={`canvas-card canvas-card--${data.kind} ${modifiers}`.trim()}
      data-readonly={data.kind === 'origin' || undefined}
      data-enabled={data.output ? String(enabled) : undefined}
      data-covered={covered || undefined}
      aria-label={data.label}
      aria-busy={data.state === 'running' || undefined}
    >
      {data.kind === 'prompt' ? <p className="canvas-prompt-text">{data.text}</p> : null}
      {data.kind === 'output' && !open ? (
        <>
          <div className="canvas-node-line">
            {outputKind === 'priority' ? <Icon name="drag-handle" size={24} /> : null}
            <p className="canvas-output-text" title={data.text}>
              {data.text}
            </p>
            {outputKind === 'evidence' ? (
              <span
                className="canvas-node-switch"
                data-on={String(enabled !== false)}
                aria-hidden="true"
              />
            ) : null}
            {row ? <Icon name="minus-circle" size={24} /> : null}
          </div>
          {data.output?.sourceType === 'model_knowledge' ? (
            <small>{data.labels.modelKnowledge}</small>
          ) : null}
        </>
      ) : null}
      {data.kind === 'placeholder' && !data.error ? (
        <div
          className={`canvas-placeholder${pending ? ' canvas-skeleton' : ''}`}
          role="img"
          aria-label={
            data.state === 'failed'
              ? data.labels.failed
              : pending
                ? data.labels.pending
                : data.labels.skipped
          }
        />
      ) : null}
      {data.kind === 'origin' ? <OriginAnswer data={data} /> : null}
      {data.kind === 'answer' ? (
        <>
          <div className={`canvas-image-slot${pending ? ' canvas-gradient' : ''}`}>
            {data.answer ? (
              <AnswerImage
                key={data.answer.imageUrl}
                url={data.answer.imageUrl}
                label={data.label}
              />
            ) : null}
          </div>
          <div className="canvas-answer-footer">
            {answerFooter ?? <strong>{data.label}</strong>}
            {data.state === 'running' ? <span>{data.labels.generating}</span> : null}
          </div>
          {data.answer?.isSample ? (
            <div className="canvas-sample">
              <strong>{CANVAS_COPY.sample}</strong>
              <p>{CANVAS_COPY.sampleDescription}</p>
            </div>
          ) : null}
        </>
      ) : null}
      {data.error ? (
        <div className="canvas-error" role="alert">
          <span>{data.error.message}</span>
          {data.error.retryable && data.onRetry ? (
            <button
              type="button"
              className="nodrag nopan nowheel canvas-retry"
              disabled={retrying}
              aria-busy={retrying || undefined}
              onClick={() => void retry()}
            >
              {data.labels.retry}
            </button>
          ) : null}
        </div>
      ) : null}
      {data.state === 'skipped' && data.kind === 'output' && !open ? (
        <small>{data.labels.skipped}</small>
      ) : null}
      {children}
    </article>
  );
}
