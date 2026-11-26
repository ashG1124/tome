import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ComponentPropsWithRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { resetBrowserSession } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { BusyMark, Dialog } from '../../shared/ui';
import { armResetNotice, showResetNotice } from './resetNotice';

type PillProps = ComponentPropsWithRef<'button'> & {
  variant: 'primary' | 'secondary';
  busy?: boolean;
};

/** 알약 버튼. 완료 모달의 Cancel·Done 버튼(DialogButton)과 같은 모양이다. */
function PillButton({ variant, busy = false, disabled, className, children, ...rest }: PillProps) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={[
        'box-border inline-flex min-w-[var(--size-dialog-button)] cursor-pointer items-center justify-center',
        'gap-[var(--space-padding-3)] rounded-[var(--radius-max)] border border-solid border-transparent',
        'px-[var(--space-padding-7)] py-[calc(var(--space-padding-3)-var(--stroke-weight-light))]',
        '[font:var(--text-body-b1-m)] tracking-[var(--letter-spacing-body-b1)]',
        variant === 'primary'
          ? 'bg-[color:var(--color-fill-neutral)] text-[color:var(--color-font-on-fill)]'
          : 'bg-[color:var(--color-shadow-weak)] text-[color:var(--color-font-main-text)]',
        'disabled:cursor-not-allowed disabled:bg-[color:var(--color-gray-20)]',
        'disabled:border-[color:var(--color-border-default)] disabled:text-[color:var(--color-font-disable)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
      <BusyMark busy={busy} />
    </button>
  );
}

/**
 * 전시 운영자용 세션 초기화 화면(/reset, #251). 전시 PC 브라우저에 즐겨찾기로 두고 쓴다.
 * 큰 버튼 하나 → 확인 창(포커스는 Cancel 에 먼저, Esc 는 취소) → 이 브라우저의 TÓME 값을 지우고 처음 화면으로.
 */
export function ResetPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // 화면이 다시 그려지기 전에 연달아 눌러도 초기화가 한 번만 돌도록 ref 로 막는다.
  const running = useRef(false);
  // 확인 창은 Radix Trigger 없이 열어서, 닫힌 뒤 포커스를 여는 버튼으로 직접 돌려준다.
  const openButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (confirming) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    openButton.current?.focus();
  }, [confirming]);

  const reset = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    armResetNotice();
    await resetBrowserSession({ queryClient });
    showResetNotice();
    void navigate('/', { replace: true });
  };

  return (
    <section
      aria-labelledby="reset-title"
      className="mx-auto mt-[var(--space-gap-field)] flex max-w-[var(--size-dialog-width)] flex-col items-start gap-[var(--space-gap-5)]"
    >
      <p className="m-0 [font:var(--text-body-b2-m)] text-[color:var(--color-font-helper-text)]">
        {COPY['RS-01']}
      </p>
      <h1
        id="reset-title"
        className="m-0 [font:var(--text-heading-h1)] text-[color:var(--color-font-strong)]"
      >
        {COPY['RS-02']}
      </h1>
      <p className="m-0 [font:var(--text-body-b1-r)] text-[color:var(--color-font-sub-text)]">
        {COPY['RS-03']}
      </p>
      <PillButton ref={openButton} variant="primary" onClick={() => setConfirming(true)}>
        {COPY['RS-02']}
      </PillButton>
      <Link
        to="/"
        className="rounded-[var(--radius-1)] [font:var(--text-body-b1-m)] text-[color:var(--color-font-sub-text)] underline"
      >
        {COPY['RS-07']}
      </Link>

      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!busy) setConfirming(open);
        }}
        dismissible={!busy}
        title={COPY['RS-04']}
        description={COPY['RS-05']}
      >
        {/* Cancel 이 먼저 와서 창을 열면 포커스가 Cancel 에 간다(되돌릴 수 없는 버튼은 기본 포커스가 아니다). */}
        <div className="mt-[var(--space-gap-field)] flex justify-end gap-[var(--space-gap-4)]">
          <PillButton variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
            {COPY['D-09a']}
          </PillButton>
          <PillButton variant="primary" busy={busy} onClick={() => void reset()}>
            {COPY['RS-06']}
          </PillButton>
        </div>
      </Dialog>
    </section>
  );
}
