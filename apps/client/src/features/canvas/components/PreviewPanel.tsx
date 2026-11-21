import { memo, useId, useRef, useState, type ReactNode } from 'react';
import type { Answer } from '@tome/shared';
import { Flash, Icon } from '../../../shared/ui';
import { COPY } from '../../../shared/copy';
import { useApiImage } from '../../../shared/api';
import '../canvas.css';
import '../node-edit.css';

export interface PreviewPanelProps {
  title: string;
  applyLabel: string;
  statusLabel: string;
  errorMessage?: string;
  generating: boolean;
  applying: boolean;
  canApply: boolean;
  stacked: boolean;
  answer: Answer;
  renderImage?: (answer: Answer) => ReactNode;
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
  applying,
  canApply,
  stacked,
  answer,
  renderImage,
  onApply,
  onRetry,
}: PreviewPanelProps) {
  const [open, setOpen] = useState(true);
  const imageId = useId();
  return (
    <section
      className="node-preview-panel nodrag nopan nowheel"
      aria-label={title}
      aria-busy={generating || applying}
    >
      <div
        id={imageId}
        hidden={!open}
        className={`canvas-image-slot node-preview-image${generating ? ' canvas-gradient' : ''}`}
      >
        <div className="node-preview-base">
          {renderImage ? (
            renderImage(answer)
          ) : (
            <PreviewImage key={answer.imageUrl} answer={answer} label={title} />
          )}
        </div>
      </div>
      <div className="node-preview-toolbar">
        <strong>
          <Icon name="preview-solid" />
          {title}
        </strong>
        <button
          type="button"
          className="node-preview-apply"
          disabled={!canApply || generating || applying}
          aria-busy={applying || undefined}
          onClick={() => void onApply()}
        >
          {applyLabel}
        </button>
        <button
          type="button"
          className="node-preview-toggle"
          aria-label={title}
          aria-expanded={open}
          aria-controls={imageId}
          onClick={() => setOpen((previous) => !previous)}
        >
          <Icon name={open ? 'arrow-down' : 'arrow-up'} />
        </button>
      </div>
      <div role="status" aria-live="polite">
        {statusLabel}
      </div>
      {errorMessage ? (
        <div role="alert">
          {errorMessage}
          {onRetry ? (
            <button type="button" disabled={applying || generating} onClick={onRetry}>
              {COPY['E-01b']}
            </button>
          ) : null}
        </div>
      ) : null}
      <Flash kind={stacked ? 'stack' : null} />
    </section>
  );
});
