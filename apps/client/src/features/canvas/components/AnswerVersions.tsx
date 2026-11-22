import { memo } from 'react';
import type { Answer, AnswerSummary } from '@tome/shared';
import { CANVAS_COPY, COPY } from '../../../shared/copy';
import { Icon } from '../../../shared/ui';
import { orderedAnswers } from '../hooks/useAnswerHistory';
import '../history.css';

export interface AnswerVersionLabels {
  previous: string;
  next: string;
  pin: string;
  unpin: string;
}
export interface AnswerVersionsProps {
  answer: Answer;
  answers: readonly AnswerSummary[];
  labels: AnswerVersionLabels;
  loading?: boolean;
  pinning?: boolean;
  disabled?: boolean;
  onSelect: (answerId: string) => void;
  onPin: (answerId: string, pinned: boolean) => Promise<void>;
}
export const AnswerVersions = memo(function AnswerVersions({
  answer,
  answers,
  labels,
  loading = false,
  pinning = false,
  disabled = false,
  onSelect,
  onPin,
}: AnswerVersionsProps) {
  const versions = orderedAnswers(answers);
  const index = versions.findIndex((entry) => entry.id === answer.id);
  return (
    <div className="canvas-answer-versions nodrag nopan nowheel" aria-busy={loading || pinning}>
      <button
        type="button"
        aria-label={labels.previous}
        disabled={disabled || loading || index <= 0}
        onClick={() => onSelect(versions[index - 1]!.id)}
      >
        <Icon name="arrow-left" />
      </button>
      <span aria-live="polite" aria-atomic="true">
        {answer.number === null ? COPY['C-06'] : CANVAS_COPY.answer(answer.number)}
      </span>
      <button
        type="button"
        aria-label={labels.next}
        disabled={disabled || loading || index < 0 || index >= versions.length - 1}
        onClick={() => onSelect(versions[index + 1]!.id)}
      >
        <Icon name="arrow-right" />
      </button>
      <button
        type="button"
        data-answer-pin
        aria-label={answer.pinned ? labels.unpin : labels.pin}
        aria-pressed={answer.pinned}
        disabled={disabled || pinning || loading || answer.status !== 'accepted'}
        onClick={() => void onPin(answer.id, !answer.pinned)}
      >
        <Icon name={answer.pinned ? 'pin-solid' : 'pin-outline'} />
      </button>
    </div>
  );
});
