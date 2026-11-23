import { memo, useEffect, useId, useRef, useState } from 'react';
import type { Connection } from '@tome/shared';
import { COPY } from '../../../shared/copy';
import { errorCopyKey } from '../../../shared/api';
import '../remix.css';

export interface ConnectionPopoverProps {
  answerId: string;
  connection: Connection;
  disabled?: boolean;
  onDismiss: (answerId: string, connection: Connection) => Promise<void>;
}

export const ConnectionPopover = memo(function ConnectionPopover({
  answerId,
  connection,
  disabled = false,
  onDismiss,
}: ConnectionPopoverProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [dismissed, setDismissed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const id = useId();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (open) closer.current?.focus({ preventScroll: true });
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  const dismiss = async () => {
    if (lock.current || disabled) return;
    lock.current = true;
    setPending(true);
    setError(undefined);
    const card = trigger.current?.closest<HTMLElement>('[data-canvas-card]');
    try {
      await onDismiss(answerId, connection);
      if (mounted.current) setDismissed(true);
      if (
        card?.isConnected &&
        (document.activeElement === document.body || card.contains(document.activeElement))
      )
        card.focus({ preventScroll: true });
    } catch (failure) {
      if (mounted.current) setError(failure);
    } finally {
      lock.current = false;
      if (mounted.current) setPending(false);
    }
  };
  if (dismissed || connection.status === 'dismissed') return null;
  return (
    <div
      className="canvas-connection nodrag nopan nowheel"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="canvas-connection-trigger"
        disabled={disabled || pending}
        aria-label={`${COPY['RC-01']}: ${connection.predictedAction}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setError(undefined);
          setOpen((value) => !value);
        }}
      />
      {open ? (
        <section
          id={id}
          className="canvas-connection-popover"
          aria-label={COPY['RC-01']}
          aria-busy={pending || undefined}
        >
          <header>
            <strong>{connection.predictedAction}</strong>
            <button ref={closer} type="button" aria-label={COPY['D-11']} onClick={close}>
              {COPY['D-11']}
            </button>
          </header>
          <p className="canvas-connection-sentence">{connection.sentence}</p>
          <div className="canvas-connection-actions">
            <button type="button" disabled aria-describedby={`${id}-apply-wait`}>
              {COPY['RC-02']}
            </button>
            <button
              type="button"
              disabled={pending || disabled || connection.status !== 'shown'}
              onClick={() => void dismiss()}
            >
              {COPY['RC-03']}
            </button>
          </div>
          <p id={`${id}-apply-wait`} className="canvas-connection-help">
            {connection.status === 'applied' ? COPY['RC-06'] : COPY['RC-04']}
          </p>
          <div className="canvas-sr-only" role="status" aria-live="polite">
            {pending ? COPY['RC-05'] : ''}
          </div>
          {error ? <div role="alert">{COPY[errorCopyKey(error)]}</div> : null}
        </section>
      ) : null}
    </div>
  );
});
