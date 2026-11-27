import { useRef, useState, type ReactNode, type ComponentPropsWithoutRef } from 'react';
import type { CardData } from '../model';
import { CANVAS_COPY, COPY } from '../../../shared/copy';
import { useApiImage } from '../../../shared/api';
import { Icon } from '../../../shared/ui';

/** 프롬프트 노드 반짝임 글리프 한 변(px). 24 칸 안 inset 8.33% (시안 3053:68396 > 1182:52458) */
const PROMPT_MARK_GLYPH = 20;

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

/** 원작 답변 카드. 읽기 전용이고, My answer 가 활성이면 원작 그림 위에 흐림을 덮는다(시안 Work Space-Derive 1679:15197). */
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
      {/* 흐림은 원작 답변이 비활성일 때만(My answer 가 활성, #229) */}
      {data.inactive ? <span className="canvas-origin-veil" aria-hidden="true" /> : null}
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
      data-inactive={data.inactive || undefined}
      data-enabled={data.output ? String(enabled) : undefined}
      data-covered={covered || undefined}
      aria-label={data.label}
      aria-busy={data.state === 'running' || undefined}
    >
      {data.kind === 'prompt' ? (
        <>
          {/* 시안 Node/Prompt 1192:65515: 이름표 줄(Prompt · 오른쪽 위 반짝임) + 프롬프트 글 */}
          <div className="canvas-prompt-head" aria-hidden="true">
            <span>{data.label}</span>
            <span className="canvas-prompt-mark">
              <Icon name="sparkle" size={PROMPT_MARK_GLYPH} />
            </span>
          </div>
          <p className="canvas-prompt-text">{data.text}</p>
        </>
      ) : null}
      {/* 근거의 Model knowledge·검증 전 Not measured 안내 줄은 리드 결정으로 그리지 않는다(#230). */}
      {data.kind === 'output' && !open ? (
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
            ) : data.summary ? (
              <AnswerImage
                key={data.summary.thumbUrl}
                url={data.summary.thumbUrl}
                label={data.label}
              />
            ) : null}
            {/* 파생의 비활성 My answer 는 원작 카드처럼 번호 칩 + 흐림을 덮는다(#229) */}
            {data.inactive ? (
              <>
                <span className="canvas-answer-chip">{data.label}</span>
                <span className="canvas-origin-veil" aria-hidden="true" />
              </>
            ) : null}
          </div>
          {data.inactive ? null : (
            <div className="canvas-answer-footer">
              {answerFooter ?? <strong>{data.label}</strong>}
              {data.state === 'running' ? <span>{data.labels.generating}</span> : null}
            </div>
          )}
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
      {children}
    </article>
  );
}
