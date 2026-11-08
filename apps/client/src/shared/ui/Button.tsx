import type { ComponentPropsWithoutRef } from 'react';

type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  /** 요청이 끝날 때까지 true. 버튼을 잠그고 aria-busy 를 켠다. */
  busy?: boolean;
};

/** 기본 버튼. 처리 중이거나 비활성이면 hover 효과 없이 공통 비활성 모양이 된다. */
export function Button({
  busy = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={[
        'box-border rounded-[var(--radius-2)] border border-solid',
        'border-[length:var(--stroke-weight-light)] border-[color:var(--color-border-input)]',
        'px-[var(--space-padding-8)] py-[var(--space-padding-3)]',
        '[font:var(--text-body-b1-m)] tracking-[var(--letter-spacing-default)]',
        'bg-[color:var(--color-fill-brand)] text-[color:var(--color-font-main-text)]',
        'cursor-pointer enabled:hover:bg-[color:var(--color-fill-brand-med)]',
        'disabled:cursor-not-allowed disabled:bg-[color:var(--color-gray-20)]',
        'disabled:border-[color:var(--color-border-default)] disabled:text-[color:var(--color-font-disable)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
