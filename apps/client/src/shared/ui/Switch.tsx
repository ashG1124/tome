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
 * 시안: Done Modal 의 active switch(3182:176310, 50.909×28)와 켜짐 모양(1226:67909).
 * 바깥선·그림자 없이 면 색(꺼짐 Card, 켜짐 Tome Yellow/7)과 흰 손잡이뿐이다.
 * 켜짐/꺼짐은 색과 함께 손잡이 위치(왼쪽/오른쪽)로도 구분된다.
 * 키보드 포커스는 바깥에 Figma 톤 테두리를 보인다(입력칸과 같은 색, 리드 결정 #185).
 */
export function Switch({ checked, onCheckedChange, disabled, ...rest }: SwitchProps) {
  return (
    <RadixSwitch.Root
      {...rest}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={[
        'relative box-border shrink-0 cursor-pointer rounded-[var(--radius-max)] border-0 p-0',
        'h-[var(--size-switch-height)] w-[var(--size-switch-width)]',
        'bg-[color:var(--color-fill-card)] data-[state=checked]:bg-[color:var(--color-tome-yellow-7)]',
        'focus-visible:outline-[color:var(--color-border-input)]!',
        'disabled:cursor-not-allowed disabled:bg-[color:var(--color-gray-20)]',
        'disabled:shadow-[inset_0_0_0_var(--stroke-weight-light)_var(--color-border-default)]',
      ].join(' ')}
    >
      <RadixSwitch.Thumb
        className={[
          'absolute top-1/2 block -translate-y-1/2 rounded-[var(--radius-max)]',
          'size-[var(--size-switch-thumb)] bg-[color:var(--color-background-default)]',
          'left-[var(--space-switch-thumb-off)]',
          'data-[state=checked]:left-[calc(100%-var(--size-switch-thumb)-var(--space-switch-thumb-on))]',
        ].join(' ')}
      />
    </RadixSwitch.Root>
  );
}
