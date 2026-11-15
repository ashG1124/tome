import { LIMITS } from '@tome/shared';
import type { ComponentPropsWithoutRef } from 'react';

type TitleInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'aria-label'> & {
  'aria-label': string;
};

/**
 * 제목 입력칸.
 * 상태는 CSS로만 나눈다: 빈 값 = Default(안내 글자), 포커스 = Writing(진한 테두리), 값 있음 = Done.
 * 기본 테두리는 --color-border-input(흰 바탕 3:1 이상)이라 시안의 연한 테두리보다 진하다.
 * 오류면 aria-invalid 를 주면 된다: 굵은 Peach 테두리가 되고, 색만으로는 대비가 모자라 화면이 오류 문장(아이콘 포함)을
 * aria-describedby 로 함께 보여 준다.
 * 키보드 포커스는 전역 :focus-visible 테두리가 겹쳐 보인다. 비활성은 글자·면·테두리를 공통 규칙대로 바꾼다.
 * 문구는 props(placeholder)로만 받는다. 너비는 부모가 정한다.
 */
export function TitleInput({ className, maxLength = LIMITS.TITLE_MAX, ...rest }: TitleInputProps) {
  return (
    <input
      type="text"
      maxLength={maxLength}
      className={[
        'box-border w-full rounded-[var(--radius-input)] border border-solid',
        'h-[var(--size-input-height)] px-[var(--space-padding-5)]',
        'border-[length:var(--stroke-weight-light)] border-[color:var(--color-border-input)]',
        'focus:border-[color:var(--color-fill-neutral)]',
        'aria-[invalid=true]:border-[length:var(--stroke-weight-bold)]',
        'aria-[invalid=true]:border-[color:var(--color-tome-peach-5)]',
        'bg-[color:var(--color-background-default)]',
        '[font:var(--text-body-b1-r)] tracking-[var(--letter-spacing-default)]',
        'text-[color:var(--color-font-main-text)]',
        'placeholder:text-[color:var(--color-font-helper-text)] placeholder:opacity-100',
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
