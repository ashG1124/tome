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
}

/**
 * 알약 모양 탭 묶음(Radix Tabs 래핑). 좌우 화살표로 탭을 옮기고, 옮기면 바로 그 탭이 열린다.
 * 고른 탭은 색과 함께 글자 굵기로도 구분된다.
 * 시안: Segment 1897:65652.
 */
export function Tabs<T extends string>({
  value,
  onValueChange,
  label,
  items,
  children,
}: TabsProps<T>) {
  return (
    <RadixTabs.Root
      value={value}
      onValueChange={(next) => {
        const item = items.find((i) => i.value === next);
        if (item !== undefined) onValueChange(item.value);
      }}
      className="flex min-w-0 flex-col gap-[var(--space-padding-8)]"
    >
      <RadixTabs.List aria-label={label} className="flex gap-[var(--space-gap-4)]">
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            className={[
              'box-border h-[var(--size-segment-height)] cursor-pointer rounded-[var(--radius-max)] px-[var(--space-padding-6)]',
              'border border-solid border-[length:var(--stroke-weight-light)] tracking-[var(--letter-spacing-default)]',
              'border-[color:var(--color-border-input)] bg-[color:var(--color-background-default)] [font:var(--text-body-b1-r)] text-[color:var(--color-font-helper-text)]',
              'data-[state=active]:border-transparent data-[state=active]:bg-[color:var(--color-fill-brand)] data-[state=active]:[font:var(--text-body-b1-m)] data-[state=active]:text-[color:var(--color-font-strong)]',
            ].join(' ')}
          >
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      <RadixTabs.Content value={value}>{children}</RadixTabs.Content>
    </RadixTabs.Root>
  );
}
