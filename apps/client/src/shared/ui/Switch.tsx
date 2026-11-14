import * as RadixSwitch from '@radix-ui/react-switch';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** 스위치 이름이 되는 글(질문 문장 등)의 id. 이름을 글로 보여 주지 않을 때는 aria-label 을 쓴다. */
  'aria-labelledby'?: string;
  'aria-label'?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * 켜고 끄는 스위치(Radix Switch 래핑). Space·Enter 로 켜고 끈다.
 * 켜짐/꺼짐은 색과 함께 손잡이 위치로도 구분된다.
 * 바깥선은 흰 바탕에서 3:1 이 되도록 --color-border-input 을 쓴다(시안에는 선 없음).
 * 시안: Completion Modal 3182:176864 의 게시 토글.
 */
export function Switch({ checked, onCheckedChange, disabled, ...rest }: SwitchProps) {
  return (
    <RadixSwitch.Root
      {...rest}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={[
        'relative box-border shrink-0 cursor-pointer rounded-[var(--radius-max)] border border-solid p-0',
        'h-[var(--size-switch-height)] w-[var(--size-switch-width)]',
        'border-[length:var(--stroke-weight-light)] border-[color:var(--color-border-input)]',
        'bg-[color:var(--color-fill-card)] data-[state=checked]:bg-[color:var(--color-tome-yellow-7)]',
        'disabled:cursor-not-allowed disabled:border-[color:var(--color-border-default)] disabled:bg-[color:var(--color-gray-20)]',
      ].join(' ')}
    >
      <RadixSwitch.Thumb
        className={[
          'absolute top-1/2 block -translate-y-1/2 rounded-[var(--radius-max)]',
          'size-[calc(var(--size-switch-height)-2*var(--space-padding-2))]',
          'bg-[color:var(--color-background-default)] shadow-[var(--shadow-03)]',
          'left-[var(--space-padding-2)] data-[state=checked]:left-auto data-[state=checked]:right-[var(--space-padding-2)]',
        ].join(' ')}
      />
    </RadixSwitch.Root>
  );
}
