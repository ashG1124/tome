import { memo, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { Connection } from '@tome/shared';
import { COPY } from '../../../shared/copy';
import { errorCopyKey, useApiImage } from '../../../shared/api';
import { Icon } from '../../../shared/ui';
import { CanvasNavigation } from '../navigation';
import type { ConnectionPartner } from '../remix-model';
import '../remix.css';

export interface ConnectionPopoverProps {
  answerId: string;
  connection: Connection;
  disabled?: boolean;
  onDismiss: (answerId: string, connection: Connection) => Promise<void>;
}

/** 말풍선 왼쪽 32 사진(1705:20752). 상대 사진이 없으면 이름 머리글자, 상대를 모르면 빈 동그라미. */
function PartnerPhoto({ partner }: { partner: ConnectionPartner | undefined }) {
  const initial = Array.from(partner?.displayName.trim() ?? '')[0]?.toUpperCase() ?? '';
  return (
    <span className="canvas-connection-photo" aria-hidden="true">
      {partner?.avatarUrl ? <PartnerImage path={partner.avatarUrl} fallback={initial} /> : initial}
    </span>
  );
}

/** 사진 주소가 있을 때만 그림을 받는다. 못 받으면 머리글자로 돌아간다. */
function PartnerImage({ path, fallback }: { path: string; fallback: string }) {
  const image = useRef<HTMLImageElement>(null);
  const { directSrc, failed } = useApiImage(path, image);
  if (failed) return fallback;
  return <img ref={image} src={directSrc} alt="" />;
}

/**
 * 노드 왼쪽 위 모서리의 Connection 표시(1187:61226, 60×60 갈고리 두 개)와 말풍선(1708:20784).
 * 누르면 두 갈고리가 벌어지며 그 사이에 주황 말풍선이 열린다: 사진 · 글(누르면 1쪽 예측 ↔ 2쪽 근거) · Apply.
 * 오른쪽 아래 갈고리(표시 버튼)는 제자리에 남아 다시 누르면 닫힌다. 왼쪽이 모자라면 오른쪽으로 연다.
 */
export const ConnectionPopover = memo(function ConnectionPopover({
  answerId,
  connection,
  disabled = false,
  onDismiss,
}: ConnectionPopoverProps) {
  const partner = useContext(CanvasNavigation).remix?.partnerFor?.(connection);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<0 | 1>(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [dismissed, setDismissed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const pager = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const id = useId();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // 왼쪽으로 열었을 때 캔버스 왼쪽 끝을 넘으면 오른쪽으로 연다(첫 열 노드). 화면 상태가 아니라 DOM 표시만 바꾼다.
  useLayoutEffect(() => {
    const wrap = root.current;
    if (wrap === null) return;
    if (!open || panel.current === null) {
      delete wrap.dataset.side;
      return;
    }
    delete wrap.dataset.side;
    const bounds = wrap.closest('.react-flow')?.getBoundingClientRect();
    if (panel.current.getBoundingClientRect().left < (bounds?.left ?? 0)) wrap.dataset.side = 'end';
  }, [open]);
  useEffect(() => {
    if (open) pager.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
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
      ref={root}
      className="canvas-connection nodrag nopan nowheel"
      data-open={open || undefined}
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
          setPage(0);
          setOpen((value) => !value);
        }}
      />
      {open ? (
        <section
          ref={panel}
          id={id}
          className="canvas-connection-popover"
          aria-label={COPY['RC-01']}
          aria-busy={pending || undefined}
        >
          {error ? (
            <div role="alert" className="canvas-connection-note">
              <Icon name="warning" size={20} />
              {COPY[errorCopyKey(error)]}
            </div>
          ) : null}
          {/* Apply 가 잠긴 이유 한 줄(공통 비활성 규칙). 시안에는 없는 공통 상태다 */}
          <p id={`${id}-apply-wait`} className="canvas-connection-note">
            {connection.status === 'applied' ? COPY['RC-06'] : COPY['RC-04']}
          </p>
          <div className="canvas-connection-row">
            <span className="canvas-connection-hook" data-hook="start" aria-hidden="true" />
            <div className="canvas-connection-message">
              <PartnerPhoto partner={partner} />
              {/* 글을 누르면 1쪽(예측) ↔ 2쪽(실제 기록에서 센 근거)을 오간다. 아래 점 두 개가 지금 쪽이다 */}
              <button
                ref={pager}
                type="button"
                className="canvas-connection-page"
                onClick={() => setPage((value) => (value === 0 ? 1 : 0))}
              >
                <span className="canvas-connection-text" aria-live="polite">
                  {page === 0 ? connection.predictedAction : connection.sentence}
                </span>
                <span className="canvas-connection-dots" aria-hidden="true">
                  <span data-on={page === 0 || undefined} />
                  <span data-on={page === 1 || undefined} />
                </span>
              </button>
              <button
                type="button"
                className="canvas-connection-pill"
                disabled
                aria-describedby={`${id}-apply-wait`}
              >
                {connection.status === 'applied' ? COPY['RC-06'] : COPY['RC-02']}
              </button>
              <button
                type="button"
                className="canvas-connection-pill"
                disabled={pending || disabled || connection.status !== 'shown'}
                onClick={() => void dismiss()}
              >
                {COPY['RC-03']}
              </button>
            </div>
            <span className="canvas-connection-hook" data-hook="end" aria-hidden="true" />
          </div>
          <div className="canvas-sr-only" role="status" aria-live="polite">
            {pending ? COPY['RC-05'] : ''}
          </div>
        </section>
      ) : null}
    </div>
  );
});
