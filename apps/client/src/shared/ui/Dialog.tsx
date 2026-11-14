import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  /** false 이면 Esc·바깥 클릭으로 닫히지 않는다(동의처럼 꼭 답해야 하는 모달). 기본 true. */
  dismissible?: boolean;
  /**
   * 뒤 배경. dim = 회색 반투명(기본), yellow = 시안의 Yellow Dim(3182:176129):
   * 뒤 화면을 흐리게 하고 아래에서 위로 옅은 노란빛을 올린다.
   */
  backdrop?: 'dim' | 'yellow';
  children?: ReactNode;
}

const BACKDROP = {
  dim: 'bg-[color:var(--color-background-dim)]',
  yellow: [
    'backdrop-blur-[var(--blur-dim)]',
    'bg-[linear-gradient(to_top,var(--color-dim-from)_27.13%,var(--color-dim-to)_87.87%)]',
  ].join(' '),
} as const;

/** Radix Dialog 래핑. 포커스 가둠·Esc·aria 연결은 Radix 기본 동작을 따른다. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  dismissible = true,
  backdrop = 'dim',
  children,
}: DialogProps) {
  const keepOpen = (event: Event) => {
    if (!dismissible) event.preventDefault();
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          data-backdrop={backdrop}
          className={`fixed inset-0 ${BACKDROP[backdrop]}`}
        />
        <RadixDialog.Content
          onEscapeKeyDown={keepOpen}
          onPointerDownOutside={keepOpen}
          onInteractOutside={keepOpen}
          className={[
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'box-border w-[var(--size-dialog-width)] max-w-[90vw]',
            'rounded-[var(--radius-node)] bg-[color:var(--color-background-default)]',
            'p-[var(--space-padding-8)] shadow-[var(--shadow-floating)]',
          ].join(' ')}
        >
          <RadixDialog.Title className="m-0 [font:var(--text-heading-h1)] text-[color:var(--color-font-strong)]">
            {title}
          </RadixDialog.Title>
          <RadixDialog.Description className="mt-[var(--space-padding-3)] mb-0 [font:var(--text-body-b1-r)] text-[color:var(--color-font-sub-text)]">
            {description}
          </RadixDialog.Description>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
