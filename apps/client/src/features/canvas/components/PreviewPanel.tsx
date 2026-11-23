import { memo, useId, useRef, useState, type ReactNode } from 'react';
import type { Answer } from '@tome/shared';
import { Flash, Icon } from '../../../shared/ui';
import { COPY } from '../../../shared/copy';
import { useApiImage } from '../../../shared/api';
import '../canvas.css';
import '../node-edit.css';

export type PreviewStatus = 'default' | 'generating' | 'done';

export interface PreviewNavigation {
  index: number;
  count: number;
  previous: string;
  next: string;
  onPrevious: () => void;
  onNext: () => void;
}

export interface PreviewPanelProps {
  title: string;
  applyLabel: string;
  statusLabel: string;
  errorMessage?: string;
  /** 미리보기가 없으면 default(빈 자리), 만드는 중이면 generating, 결과가 있으면 done */
  generating: boolean;
  /** 결과 미리보기가 있다. 없으면 이미지를 그리지 않는다(지어내지 않음). */
  hasPreview?: boolean;
  applying: boolean;
  canApply: boolean;
  stacked: boolean;
  /** 보여 줄 답변. 없으면 빈 자리만 그린다. */
  answer?: Answer;
  renderImage?: (answer: Answer) => ReactNode;
  /** 미리보기가 둘 이상일 때만 넘긴다. 좌우 이동은 count > 1 일 때만 나온다. */
  navigation?: PreviewNavigation;
  /** 제어형: 넘기지 않으면 닫힌 채로 시작한다. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onRetry?: () => void;
  onApply: () => Promise<void>;
}

function PreviewImage({ answer, label }: { answer: Answer; label: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const { directSrc, failed } = useApiImage(answer.imageUrl, ref);
  const [broken, setBroken] = useState(false);
  return (
    <>
      <img
        ref={ref}
        src={directSrc}
        alt={label}
        hidden={failed || broken}
        onError={() => setBroken(true)}
      />
      {failed || broken ? <div role="status">{COPY['E-01a']}</div> : null}
    </>
  );
}

export const PreviewPanel = memo(function PreviewPanel({
  title,
  applyLabel,
  statusLabel,
  errorMessage,
  generating,
  hasPreview = false,
  applying,
  canApply,
  stacked,
  answer,
  renderImage,
  navigation,
  open: controlledOpen,
  onOpenChange,
  onApply,
  onRetry,
}: PreviewPanelProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = (next: boolean) => {
    setInnerOpen(next);
    onOpenChange?.(next);
  };
  const imageId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const status: PreviewStatus = generating ? 'generating' : hasPreview ? 'done' : 'default';
  const showImage = answer !== undefined && status !== 'default';
  const paging = navigation && navigation.count > 1 ? navigation : undefined;
  return (
    <section
      className="node-preview-panel nodrag nopan nowheel"
      aria-label={title}
      aria-busy={generating || applying}
      data-status={status}
      data-open={open}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          toggle.current?.focus({ preventScroll: true });
        }
      }}
    >
      <div
        id={imageId}
        hidden={!open}
        className={`canvas-image-slot node-preview-image${generating ? ' canvas-gradient' : ''}`}
      >
        <div className="node-preview-base">
          {showImage ? (
            renderImage ? (
              renderImage(answer)
            ) : (
              <PreviewImage key={answer.imageUrl} answer={answer} label={title} />
            )
          ) : null}
        </div>
        {paging ? (
          <div className="node-preview-nav">
            <button
              type="button"
              aria-label={paging.previous}
              disabled={paging.index <= 0}
              onClick={paging.onPrevious}
            >
              <Icon name="arrow-left" />
            </button>
            <button
              type="button"
              aria-label={paging.next}
              disabled={paging.index >= paging.count - 1}
              onClick={paging.onNext}
            >
              <Icon name="arrow-right" />
            </button>
          </div>
        ) : null}
      </div>
      <div className="node-preview-status canvas-sr-only" role="status" aria-live="polite">
        {statusLabel}
      </div>
      {errorMessage ? (
        <div role="alert" className="node-preview-alert">
          {errorMessage}
          {onRetry ? (
            <button type="button" disabled={applying || generating} onClick={onRetry}>
              {COPY['E-01b']}
            </button>
          ) : null}
        </div>
      ) : null}
      <Flash kind={stacked ? 'stack' : null} />
      <div className="node-preview-toolbar">
        <button
          ref={toggle}
          type="button"
          className="node-preview-toggle"
          aria-label={title}
          aria-expanded={open}
          aria-controls={imageId}
          onClick={() => setOpen(!open)}
        >
          <Icon name="preview-solid" />
          <strong>{title}</strong>
          {status === 'done' ? <span className="node-preview-dot" aria-hidden="true" /> : null}
        </button>
        {open ? (
          <button
            type="button"
            className="node-preview-apply"
            disabled={!canApply || generating || applying}
            aria-busy={applying || undefined}
            onClick={() => void onApply()}
          >
            {applyLabel}
          </button>
        ) : null}
        <button
          type="button"
          className="node-preview-chevron"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? 'arrow-down' : 'arrow-up'} />
        </button>
      </div>
    </section>
  );
});
