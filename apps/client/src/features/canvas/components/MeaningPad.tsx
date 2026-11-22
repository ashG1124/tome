import { memo, useId, useRef, type CSSProperties, type PointerEvent } from 'react';
import { LIMITS, type Pad } from '@tome/shared';
import { padCoordinates, padForKey } from '../edit-model';
import '../node-edit.css';

export interface MeaningPadProps {
  value: Pad;
  label: string;
  instructions?: string;
  disabled?: boolean;
  onChange: (value: Pad) => void;
}

function coordinate(fraction: number): number {
  return Math.min(
    LIMITS.PAD_MAX,
    Math.max(
      LIMITS.PAD_MIN,
      Math.round(LIMITS.PAD_MIN + fraction * (LIMITS.PAD_MAX - LIMITS.PAD_MIN)),
    ),
  );
}

export const MeaningPad = memo(function MeaningPad({
  value,
  label,
  instructions,
  disabled = false,
  onChange,
}: MeaningPadProps) {
  const id = useId();
  const pointer = useRef<number | null>(null);
  const coordinates = padCoordinates(value);
  const span = LIMITS.PAD_MAX - LIMITS.PAD_MIN;
  const style = {
    '--pad-x': `${((value.x - LIMITS.PAD_MIN) / span) * 100}%`,
    '--pad-y': `${((LIMITS.PAD_MAX - value.y) / span) * 100}%`,
  } as CSSProperties;
  const update = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const x = coordinate((event.clientX - box.left) / box.width);
    const y = coordinate(1 - (event.clientY - box.top) / box.height);
    if (x !== value.x || y !== value.y) onChange({ ...value, x, y });
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  return (
    <div className="node-edit-control nodrag nopan nowheel">
      <span id={`${id}-label`} className="node-edit-label">
        {label}
      </span>
      <div className="node-edit-pad-layout">
        <span className="node-edit-axis node-edit-axis--top">{value.yAxis[1]}</span>
        <span className="node-edit-axis node-edit-axis--left">{value.xAxis[0]}</span>
        <div
          className="node-edit-pad"
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-labelledby={`${id}-label`}
          aria-describedby={instructions ? `${id}-instructions` : undefined}
          aria-disabled={disabled || undefined}
          aria-valuemin={LIMITS.PAD_MIN}
          aria-valuemax={LIMITS.PAD_MAX}
          aria-valuenow={value.x}
          aria-valuetext={coordinates.join(', ')}
          style={style}
          onKeyDown={(event) => {
            const next = padForKey(value, event.key);
            if (!next) return;
            event.preventDefault();
            event.stopPropagation();
            if (!disabled && (next.x !== value.x || next.y !== value.y)) onChange(next);
          }}
          onPointerDown={(event) => {
            if (disabled || event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            pointer.current = event.pointerId;
            event.currentTarget.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture?.(event.pointerId);
            update(event);
          }}
          onPointerMove={(event) => {
            if (disabled || pointer.current !== event.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            update(event);
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={() => {
            pointer.current = null;
          }}
        >
          <span className="node-edit-pad-marker" aria-hidden="true" />
        </div>
        <span className="node-edit-axis node-edit-axis--right">{value.xAxis[1]}</span>
        <span className="node-edit-axis node-edit-axis--bottom">{value.yAxis[0]}</span>
      </div>
      <p className="node-edit-coordinates">{coordinates.join(' · ')}</p>
      {instructions ? (
        <p id={`${id}-instructions`} className="node-edit-instructions">
          {instructions}
        </p>
      ) : null}
    </div>
  );
});
