import { memo, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { Connection } from '@tome/shared';
import { COPY, type CopyKey } from '../../../shared/copy';
import { errorCopyKey, useApiImage } from '../../../shared/api';
import { Icon } from '../../../shared/ui';
import { CanvasNavigation } from '../navigation';
import type { ConnectionPartner } from '../remix-model';
import type { ConnectionApplyState } from '../connection-apply';

/** Apply 가 잠긴 이유 한 줄. 누를 수 있거나 이미 반영됐으면(버튼 글자가 Applied) 없다. */
const APPLY_REASON: Record<ConnectionApplyState, CopyKey | null> = {
  ready: null,
  applied: null,
  stale: 'RC-07',
  'no-change': 'RC-08',
  unavailable: 'RC-04',
};
import '../remix.css';

export interface ConnectionPopoverProps {
  answerId: string;
  connection: Connection;
  disabled?: boolean;
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
}: ConnectionPopoverProps) {
  const remix = useContext(CanvasNavigation).remix;
  const partner = remix?.partnerFor?.(connection);
  // Apply 상태(#151). 캔버스가 정해 주지 않으면 잠근다(RC-04).
  const applyState: ConnectionApplyState =
    remix?.applyStateFor?.(answerId, connection) ??
    (connection.status === 'applied' ? 'applied' : 'unavailable');
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<0 | 1>(0);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<unknown>();
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
    // 캡처 단계에서 듣는다: 캔버스 바탕(React Flow)이 누름 전파를 막아도 바깥 누름으로 닫힌다(#229)
    document.addEventListener('pointerdown', closeOnOutside, true);
    return () => document.removeEventListener('pointerdown', closeOnOutside, true);
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  // Apply: 연타해도 한 번만. 고른 Connection 을 기록하고 편집 세션에서 노드 값을 바꿔 미리보기를 만든다.
  const apply = async () => {
    if (lock.current || disabled || applyState !== 'ready') return;
    lock.current = true;
    setApplying(true);
    setError(undefined);
    try {
      await remix?.onApply(answerId, connection);
      remix?.requestApply?.(answerId, connection);
      // Apply 버튼이 "Applied"(잠김)로 바뀌므로 포커스를 말풍선 글 버튼으로 옮겨 잃지 않게 한다
      pager.current?.focus({ preventScroll: true });
    } catch (failure) {
      if (mounted.current) setError(failure);
    } finally {
      lock.current = false;
      if (mounted.current) setApplying(false);
    }
  };
  const reason = APPLY_REASON[applyState];
  if (connection.status === 'dismissed') return null;
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
        disabled={disabled}
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
        >
          {error ? (
            <div role="alert" className="canvas-connection-note">
              <Icon name="warning" size={20} />
              {COPY[errorCopyKey(error)]}
            </div>
          ) : null}
          {/* Apply 가 잠긴 이유 한 줄(공통 비활성 규칙). 시안에는 없는 공통 상태다 */}
          {reason !== null ? (
            <p id={`${id}-apply-wait`} className="canvas-connection-note">
              {COPY[reason]}
            </p>
          ) : null}
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
                disabled={applyState !== 'ready' || applying || disabled}
                aria-busy={applying || undefined}
                aria-describedby={reason !== null ? `${id}-apply-wait` : undefined}
                onClick={() => void apply()}
              >
                {applyState === 'applied' ? COPY['RC-06'] : COPY['RC-02']}
              </button>
              {/* 숨기기(Hide)는 두지 않는다(리드 결정 #229). 닫기는 표시 다시 누르기·Esc·바깥 누르기 */}
            </div>
            <span className="canvas-connection-hook" data-hook="end" aria-hidden="true" />
          </div>
        </section>
      ) : null}
    </div>
  );
});
