import * as RadixTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

interface TabsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  /** 탭 목록 전체의 이름(화면 낭독용) */
  label: string;
  items: ReadonlyArray<{ value: T; label: string }>;
  /** 탭 아래 내용. 지금 고른 탭의 내용만 넘긴다. */
  children: ReactNode;
  /**
   * pill = 알약 모양(Segment 1897:65652, 기본값).
   * underline = 글자 탭 + 고른 탭 아래 2px 선(Identity Segment 4181:35713). 탭과 내용 사이 간격은 내용 쪽이 정한다.
   */
  variant?: 'pill' | 'underline';
}

const TRIGGER: Record<'pill' | 'underline', string> = {
  pill: [
    'box-border h-[var(--size-segment-height)] cursor-pointer rounded-[var(--radius-max)] px-[var(--space-padding-6)]',
    'border border-solid border-[length:var(--stroke-weight-light)] tracking-[var(--letter-spacing-body-b1)]',
    'border-[color:var(--color-border-input)] bg-[color:var(--color-background-default)] [font:var(--text-body-b1-r)] text-[color:var(--color-font-helper-text)]',
    'data-[state=active]:border-transparent data-[state=active]:bg-[color:var(--color-fill-brand)] data-[state=active]:[font:var(--text-body-b1-m)] data-[state=active]:text-[color:var(--color-font-strong)]',
  ].join(' '),
  underline: [
    'box-border flex h-[var(--size-segment-height)] cursor-pointer items-center px-[var(--space-padding-3)] py-[var(--space-padding-4)]',
    'border-0 border-b-[length:var(--stroke-weight-bold)] border-solid border-transparent bg-transparent',
    '[font:var(--text-body-b1-r)] tracking-[var(--letter-spacing-body-b1)] whitespace-nowrap text-[color:var(--color-font-helper-text)]',
    'hover:text-[color:var(--color-font-sub-text)]',
    'data-[state=active]:border-[color:var(--color-fill-neutral)] data-[state=active]:text-[color:var(--color-font-strong)]',
  ].join(' '),
};

/**
 * 탭 묶음(Radix Tabs 래핑). 좌우 화살표로 탭을 옮기고, 옮기면 바로 그 탭이 열린다.
 * 알약 모양은 고른 탭을 색과 글자 굵기로, 밑줄 모양은 색과 아래 선으로 구분한다(색만으로 구분하지 않는다).
 * 시안: Segment 1897:65652, Identity Segment 4181:35713.
 */
export function Tabs<T extends string>({
  value,
  onValueChange,
  label,
  items,
  children,
  variant = 'pill',
}: TabsProps<T>) {
  return (
    <RadixTabs.Root
      value={value}
      onValueChange={(next) => {
        const item = items.find((i) => i.value === next);
        if (item !== undefined) onValueChange(item.value);
      }}
      className={`flex min-w-0 flex-col ${variant === 'pill' ? 'gap-[var(--space-padding-8)]' : ''}`}
    >
      <RadixTabs.List
        aria-label={label}
        className={variant === 'pill' ? 'flex gap-[var(--space-gap-4)]' : 'flex'}
      >
        {items.map((item) => (
          <RadixTabs.Trigger key={item.value} value={item.value} className={TRIGGER[variant]}>
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      <RadixTabs.Content value={value}>{children}</RadixTabs.Content>
    </RadixTabs.Root>
  );
}
