import { useRef, useState, type ComponentPropsWithoutRef } from 'react';
import type { CardData } from '../model';
import { CANVAS_COPY, COPY } from '../../../shared/copy';
import { useApiImage } from '../../../shared/api';

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
  ...rest
}: { data: CardData } & ComponentPropsWithoutRef<'article'>) {
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
  return (
    <article
      {...rest}
      className={`canvas-card canvas-card--${data.kind}${data.error ? ' canvas-card--error' : ''}`}
      aria-label={data.label}
      aria-busy={data.state === 'running' || undefined}
    >
      {data.kind === 'prompt' ? <p className="canvas-prompt-text">{data.text}</p> : null}
      {data.kind === 'output' ? (
        <>
          <p className="canvas-output-text" title={data.text}>
            {data.text}
          </p>
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
            <strong>{data.label}</strong>
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
      {data.state === 'skipped' && data.kind === 'output' ? (
        <small>{data.labels.skipped}</small>
      ) : null}
    </article>
  );
}
