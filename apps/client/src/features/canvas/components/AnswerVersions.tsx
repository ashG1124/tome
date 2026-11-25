import { memo, useRef } from 'react';
import type { Answer, AnswerSummary } from '@tome/shared';
import { CANVAS_COPY, COPY } from '../../../shared/copy';
import { useApiImage } from '../../../shared/api';
import { Icon } from '../../../shared/ui';
import { orderedAnswers } from '../hooks/useAnswerHistory';
import { shownNumber } from '../model';
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
  /** 화면 번호에서 뺄 수(파생의 원작 복사본, #235) */
  numberOffset?: number;
}
function StackImage({ url }: { url: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const { directSrc } = useApiImage(url, imageRef);
  return <img ref={imageRef} src={directSrc} alt="" />;
}

/** 뒤에 겹쳐 보이는 이전 버전 한 장. 앞 장의 0.9배씩 작아진다(최대 2장). */
function StackLayer({ depth, answer }: { depth: 1 | 2; answer: AnswerSummary }) {
  return (
    <div className="canvas-answer-layer" data-depth={depth} aria-hidden="true">
      {answer.thumbUrl ? <StackImage url={answer.thumbUrl} /> : null}
    </div>
  );
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
  numberOffset = 0,
}: AnswerVersionsProps) {
  const versions = orderedAnswers(answers);
  const index = versions.findIndex((entry) => entry.id === answer.id);
  const behind = [versions[index - 1], versions[index - 2]];
  return (
    <div className="canvas-answer-versions nodrag nopan nowheel" aria-busy={loading || pinning}>
      {index > 0
        ? behind.map((entry, i) =>
            entry ? <StackLayer key={entry.id} depth={(i + 1) as 1 | 2} answer={entry} /> : null,
          )
        : null}
      <span className="canvas-answer-chip" aria-live="polite" aria-atomic="true">
        {answer.number === null
          ? COPY['C-06']
          : CANVAS_COPY.answer(shownNumber(answer.number, numberOffset))}
      </span>
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
      <div className="canvas-answer-steps">
        <button
          type="button"
          aria-label={labels.previous}
          disabled={disabled || loading || index <= 0}
          onClick={() => onSelect(versions[index - 1]!.id)}
        >
          <Icon name="arrow-up" />
        </button>
        <button
          type="button"
          aria-label={labels.next}
          disabled={disabled || loading || index < 0 || index >= versions.length - 1}
          onClick={() => onSelect(versions[index + 1]!.id)}
        >
          <Icon name="arrow-down" />
        </button>
      </div>
    </div>
  );
});
