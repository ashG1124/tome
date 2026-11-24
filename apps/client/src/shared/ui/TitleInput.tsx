import { LIMITS } from '@tome/shared';
import type { ComponentPropsWithoutRef } from 'react';
import { useKeyboardFocus } from './keyboard-focus';

type TitleInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'aria-label'> & {
  'aria-label': string;
  /**
   * default = 진한 테두리(--color-border-input, 흰 바탕 3:1)와 전역 포커스 테두리.
   * modal = 시안 Title Input-Modal(3182:176487) 그대로: 연한 테두리·연한 안내 글자, 입력 중엔 진한 테두리.
   *         입력칸 안쪽엔 포커스 사각형을 그리지 않고, 키보드로 들어왔을 때만 바깥에 테두리를 보인다(리드 결정 #185).
   */
  look?: 'default' | 'modal';
};

const DEFAULT_LOOK = [
  'border-[color:var(--color-border-input)]',
  'placeholder:text-[color:var(--color-font-helper-text)]',
];

const MODAL_LOOK = [
  'border-[color:var(--color-border-default)]',
  'placeholder:text-[color:var(--color-finish-placeholder)]',
  // 전역 :focus-visible 규칙은 레이어 밖이라 Tailwind 보다 세다. ! 로 눌러야 안쪽 사각형이 사라진다.
  'focus-visible:outline-none!',
  'data-[keyboard-focus]:outline-solid! data-[keyboard-focus]:outline-[length:var(--stroke-weight-bold)]!',
  'data-[keyboard-focus]:outline-offset-[var(--focus-outline-offset)]! data-[keyboard-focus]:outline-[color:var(--color-border-input)]!',
];

/**
 * 제목 입력칸.
 * 상태는 CSS로만 나눈다: 빈 값 = Default(안내 글자), 포커스 = Writing(진한 테두리), 값 있음 = Done.
 * 오류면 aria-invalid 를 주면 된다: 굵은 Peach 테두리가 되고, 색만으로는 대비가 모자라 화면이 오류 문장(아이콘 포함)을
 * aria-describedby 로 함께 보여 준다.
 * 비활성은 글자·면·테두리를 공통 규칙대로 바꾼다.
 * 문구는 props(placeholder)로만 받는다. 너비는 부모가 정한다.
 */
export function TitleInput({
  className,
  maxLength = LIMITS.TITLE_MAX,
  look = 'default',
  onFocus,
  onBlur,
  ...rest
}: TitleInputProps) {
  const focus = useKeyboardFocus<HTMLInputElement>({ onFocus, onBlur });
  const modal = look === 'modal';
  return (
    <input
      type="text"
      maxLength={maxLength}
      data-keyboard-focus={(modal && focus.keyboardFocus) || undefined}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      className={[
        'box-border w-full rounded-[var(--radius-input)] border border-solid',
        'h-[var(--size-input-height)] px-[var(--space-padding-5)]',
        'border-[length:var(--stroke-weight-light)]',
        ...(modal ? MODAL_LOOK : DEFAULT_LOOK),
        'focus:border-[color:var(--color-fill-neutral)]',
        'aria-[invalid=true]:border-[length:var(--stroke-weight-bold)]',
        'aria-[invalid=true]:border-[color:var(--color-tome-peach-5)]',
        'bg-[color:var(--color-background-default)]',
        '[font:var(--text-body-b1-r)] tracking-[var(--letter-spacing-body-b1)]',
        'text-[color:var(--color-font-main-text)]',
        'placeholder:opacity-100',
        'disabled:cursor-not-allowed disabled:bg-[color:var(--color-gray-20)]',
        'disabled:border-[color:var(--color-border-default)] disabled:text-[color:var(--color-font-disable)]',
        'disabled:placeholder:text-[color:var(--color-font-disable)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
}
