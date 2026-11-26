import { memo, useId, useRef, type PointerEvent } from 'react';
import { LIMITS } from '@tome/shared';
import { weightForKey } from '../edit-model';
import '../node-edit.css';

export interface WeightDialProps {
  value?: number;
  label: string;
  instructions?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

/** 이 거리(화면 px)보다 덜 움직이고 떼면 끌기가 아니라 누르기다(누른 칸의 숫자를 고른다). */
export const DIAL_TAP_DISTANCE = 4;

const OFFSETS = [-2, -1, 0, 1, 2] as const;

const clamp = (value: number) =>
  Math.min(LIMITS.WEIGHT_MAX, Math.max(LIMITS.WEIGHT_MIN, Math.round(value)));

/** 숫자 한 칸의 폭과 가운데 칸의 가운데 x(화면 좌표). 크기를 잴 수 없으면 null */
function measure(dial: HTMLElement): { width: number; center: number } | null {
  const current = dial.querySelector<HTMLElement>('.node-edit-dial-current');
  const cell = current?.getBoundingClientRect();
  if (cell && cell.width > 0) return { width: cell.width, center: cell.left + cell.width / 2 };
  const box = dial.getBoundingClientRect();
  if (box.width <= 0) return null;
  return { width: box.width / OFFSETS.length, center: box.left + box.width / 2 };
}

interface Press {
  pointerId: number;
  startX: number;
  startValue: number;
  dragged: boolean;
}

/**
 * 가중치 숫자 휠(시안 Keyword 1226:68293). 가운데가 지금 값이고 양옆에 앞뒤 숫자가 보인다.
 * - 끌기: 숫자 띠를 잡아끄는 것과 같다. 왼쪽으로 끌면 오른쪽의 큰 숫자가 가운데로 와서 값이 커지고,
 *   오른쪽으로 끌면 작아진다(#261). 한 칸 폭만큼 끌 때마다 1씩 바뀐다.
 * - 누르기: 누른 칸의 숫자가 값이 된다.
 * - 키보드: ←↓ 1 줄이기, →↑ 1 늘리기, Home 0, End 9 (보이지 않는 range 입력이 받는다).
 */
export const WeightDial = memo(function WeightDial({
  value = 5,
  label,
  instructions,
  disabled = false,
  onChange,
}: WeightDialProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const press = useRef<Press | null>(null);
  const change = (next: number) => {
    if (!disabled && next !== value) onChange(next);
  };
  const finish = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const current = press.current;
    if (!current || current.pointerId !== event.pointerId) return;
    press.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancelled || current.dragged) return;
    const size = measure(event.currentTarget);
    if (!size) return;
    change(clamp(current.startValue + Math.round((event.clientX - size.center) / size.width)));
  };
  return (
    <div className="node-edit-control nodrag nopan nowheel">
      <label htmlFor={id} className="node-edit-label">
        {label}
      </label>
      <div
        className="node-edit-dial"
        data-disabled={disabled || undefined}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0) return;
          // 글자가 긁히거나 캔버스가 끌리지 않게 막고, 키보드로 이어서 고칠 수 있게 입력에 포커스를 둔다.
          event.preventDefault();
          event.stopPropagation();
          input.current?.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture?.(event.pointerId);
          press.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startValue: value,
            dragged: false,
          };
        }}
        onPointerMove={(event) => {
          const current = press.current;
          if (disabled || !current || current.pointerId !== event.pointerId) return;
          const dx = event.clientX - current.startX;
          if (!current.dragged && Math.abs(dx) <= DIAL_TAP_DISTANCE) return;
          current.dragged = true;
          const size = measure(event.currentTarget);
          if (!size) return;
          // 왼쪽으로 끌면(dx < 0) 값이 커진다.
          change(clamp(current.startValue - Math.round(dx / size.width)));
        }}
        onPointerUp={(event) => finish(event, false)}
        onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={() => {
          press.current = null;
        }}
      >
        <div className="node-edit-dial-values" aria-hidden="true">
          {OFFSETS.map((offset) => (
            <span
              key={offset}
              className={offset === 0 ? 'node-edit-dial-current' : 'node-edit-dial-neighbor'}
              data-empty={
                value + offset < LIMITS.WEIGHT_MIN ||
                value + offset > LIMITS.WEIGHT_MAX ||
                undefined
              }
            >
              {value + offset >= LIMITS.WEIGHT_MIN && value + offset <= LIMITS.WEIGHT_MAX
                ? value + offset
                : ''}
              <i />
            </span>
          ))}
        </div>
        {/* 화면에는 보이지 않고 키보드·보조기기만 쓴다. 마우스·터치는 위의 숫자 띠가 받는다. */}
        <input
          ref={input}
          id={id}
          type="range"
          className="node-edit-range"
          min={LIMITS.WEIGHT_MIN}
          max={LIMITS.WEIGHT_MAX}
          step={1}
          value={value}
          disabled={disabled}
          aria-describedby={instructions ? `${id}-instructions` : undefined}
          onChange={(event) => change(event.currentTarget.valueAsNumber)}
          onKeyDown={(event) => {
            const next = weightForKey(value, event.key);
            if (next === undefined) return;
            event.preventDefault();
            event.stopPropagation();
            change(next);
          }}
        />
      </div>
      {instructions ? (
        <p id={`${id}-instructions`} className="node-edit-instructions">
          {instructions}
        </p>
      ) : null}
    </div>
  );
});
