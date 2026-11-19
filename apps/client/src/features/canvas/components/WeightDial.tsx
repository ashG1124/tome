import { memo, useId } from 'react';
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

export const WeightDial = memo(function WeightDial({
  value = 5,
  label,
  instructions,
  disabled = false,
  onChange,
}: WeightDialProps) {
  const id = useId();
  return (
    <div className="node-edit-control nodrag nopan nowheel">
      <label htmlFor={id} className="node-edit-label">
        {label}
      </label>
      <div className="node-edit-dial">
        <div className="node-edit-dial-values" aria-hidden="true">
          {[-2, -1, 0, 1, 2].map((offset) => (
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
        <input
          id={id}
          type="range"
          className="node-edit-range"
          min={LIMITS.WEIGHT_MIN}
          max={LIMITS.WEIGHT_MAX}
          step={1}
          value={value}
          disabled={disabled}
          aria-describedby={instructions ? `${id}-instructions` : undefined}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (!disabled && next !== value) onChange(next);
          }}
          onKeyDown={(event) => {
            const next = weightForKey(value, event.key);
            if (next === undefined) return;
            event.preventDefault();
            event.stopPropagation();
            if (!disabled && next !== value) onChange(next);
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
