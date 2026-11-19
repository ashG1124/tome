import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode, Ref } from 'react';
import { COPY } from '../../../shared/copy';
import { Icon } from '../../../shared/ui';

interface FinishDialogFrameProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** wide = 완료 모달(왼쪽 정렬·넓은 폭), narrow = 확인 창(가운데 정렬) */
  size: 'wide' | 'narrow';
  /** false 이면 Esc·바깥 클릭·X 로 닫히지 않는다(요청 처리 중). 기본 true. */
  dismissible?: boolean;
  /** 열릴 때 첫 포커스 위치를 바꾸고 싶을 때 */
  onOpenAutoFocus?: (event: Event) => void;
  /** 닫힐 때 포커스를 돌려줄 위치를 바꾸고 싶을 때 */
  onCloseAutoFocus?: (event: Event) => void;
  /** 화면이 바뀌었을 때 제목으로 포커스를 옮겨 낭독기가 새 제목을 읽게 한다 */
  titleRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}

/**
 * 완료 모달·확인 창의 바깥 틀. 포커스 가둠·Esc·aria 연결은 Radix 기본 동작을 따른다.
 * 뒤 배경은 시안의 Yellow Dim: 뒤 화면을 흐리게 하고 아래에서 위로 옅은 노란빛을 올린다.
 * 닫기(X) 버튼은 오른쪽 위에 보이지만 DOM 은 맨 뒤라서 Tab 은 내용부터 지나간다.
 */
export function FinishDialogFrame({
  open,
  onOpenChange,
  title,
  description,
  size,
  dismissible = true,
  onOpenAutoFocus,
  onCloseAutoFocus,
  titleRef,
  children,
}: FinishDialogFrameProps) {
  const keepOpen = (event: Event) => {
    if (!dismissible) event.preventDefault();
  };
  const wide = size === 'wide';

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        {/* translate(-50%) 대신 격자로 가운데에 둔다. 반 픽셀 위치로 선이 번지는 것을 막는다. */}
        <RadixDialog.Overlay
          className={[
            'fixed inset-0 grid place-items-center overflow-y-auto p-[var(--space-padding-8)]',
            'backdrop-blur-[var(--blur-dim)]',
            'bg-[linear-gradient(to_top,var(--color-dim-from)_27.13%,var(--color-dim-to)_87.87%)]',
          ].join(' ')}
        >
          <RadixDialog.Content
            onOpenAutoFocus={onOpenAutoFocus}
            onCloseAutoFocus={onCloseAutoFocus}
            onEscapeKeyDown={keepOpen}
            onPointerDownOutside={keepOpen}
            onInteractOutside={keepOpen}
            className={[
              'relative box-content max-w-[calc(100vw-4*var(--space-padding-8))]',
              wide ? 'w-[var(--size-dialog-width-wide)]' : 'w-[var(--size-dialog-width)]',
              'flex flex-col gap-[var(--space-padding-8)]',
              'rounded-[var(--radius-dialog)] bg-[color:var(--color-background-default)] shadow-[var(--shadow-floating)]',
              'px-[var(--space-padding-8)] pt-[var(--space-padding-8)] pb-[var(--space-padding-8)]',
            ].join(' ')}
          >
            <div
              className={[
                'flex flex-col gap-[var(--space-padding-2)] pr-[var(--space-padding-8)]',
                wide ? 'text-left' : 'pl-[var(--space-padding-8)] text-center',
              ].join(' ')}
            >
              <RadixDialog.Title
                ref={titleRef}
                tabIndex={-1}
                className="m-0 [font:var(--text-heading-h1)] tracking-[var(--letter-spacing-heading-h1)] text-[color:var(--color-font-main-text)] focus:outline-none"
              >
                {title}
              </RadixDialog.Title>
              <RadixDialog.Description className="m-0 [font:var(--text-body-b1-r)] tracking-[var(--letter-spacing-body-b1)] text-[color:var(--color-font-sub-text)]">
                {description}
              </RadixDialog.Description>
            </div>
            {children}
            <RadixDialog.Close asChild>
              <button
                type="button"
                aria-label={COPY['D-11']}
                disabled={!dismissible}
                className={[
                  'absolute top-[var(--space-padding-8)] right-[var(--space-padding-8)]',
                  'flex cursor-pointer items-center justify-center border-0 bg-transparent p-0',
                  'text-[color:var(--color-font-sub-text)] disabled:cursor-not-allowed disabled:text-[color:var(--color-font-disable)]',
                ].join(' ')}
              >
                <Icon name="close" />
              </button>
            </RadixDialog.Close>
          </RadixDialog.Content>
        </RadixDialog.Overlay>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
