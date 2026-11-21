import type { ComponentPropsWithRef } from 'react';
import { BusyMark } from '../../../shared/ui';

type DialogButtonProps = ComponentPropsWithRef<'button'> & {
  /** primary = 진한 회색(Next·Done), secondary = 연한 회색(Skip·Cancel) */
  variant: 'primary' | 'secondary';
  /** 요청이 끝날 때까지 true. 바로 잠그고, 300ms 가 지나면 글자 옆에 원형 표시를 띄운다. */
  busy?: boolean;
};

/** 완료 모달·확인 창 아래 버튼. 비활성 모양은 공통 규칙을 따른다. */
export function DialogButton({
  variant,
  busy = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: DialogButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={[
        'box-border inline-flex w-[var(--size-dialog-button)] cursor-pointer items-center justify-center',
        'gap-[var(--space-padding-3)] rounded-[var(--radius-max)] border border-solid border-transparent',
        'py-[var(--space-padding-3)] [font:var(--text-body-b1-m)] tracking-[var(--letter-spacing-body-b1)]',
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
