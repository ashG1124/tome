import { LIMITS, PROMPT_PRESETS, type PresetKey } from '@tome/shared';
import { useId, useRef, type KeyboardEvent } from 'react';
import { COPY, type CopyKey } from '../../shared/copy';
import { canSubmitPrompt, presetKeyFor, type PromptBarState } from './prompt';

/** 프리셋 탭 이름 문구. PROMPT_PRESETS 순서와 같다. */
const PRESET_LABELS: readonly CopyKey[] = ['S-11a', 'S-11b', 'S-11c', 'S-11d', 'S-11e'];

/** 잠긴 이유 한 줄. 입력 가능할 때는 없다. */
const REASON: Record<PromptBarState, CopyKey | null> = {
  ready: null,
  generating: 'S-03',
  full: 'S-09',
};

export interface PromptSubmit {
  prompt: string;
  presetKey?: PresetKey;
}

interface PromptBarProps {
  state: PromptBarState;
  /** 세트가 없는 빈 페이지면 인사말과 프리셋을 보여 준다. */
  emptyPage: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (request: PromptSubmit) => Promise<void> | void;
}

/**
 * 워크스페이스 하단 프롬프트 바. Enter 로 보내고 Shift+Enter 는 줄바꿈이다.
 * 보내는 중에는 연달아 눌러도 한 번만 보낸다.
 */
export function PromptBar({ state, emptyPage, value, onChange, onSubmit }: PromptBarProps) {
  const input = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(false);
  const reasonId = useId();
  const reason = REASON[state];
  const locked = state !== 'ready';

  const submit = async () => {
    if (locked || sending.current || !canSubmitPrompt(value)) return;
    sending.current = true;
    try {
      const prompt = value.trim();
      const presetKey = presetKeyFor(prompt);
      await onSubmit(presetKey === undefined ? { prompt } : { prompt, presetKey });
    } finally {
      sending.current = false;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 조합 중 Enter 는 글자 확정이라 보내지 않는다.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  };

  return (
    <div className="flex flex-col items-center gap-[var(--space-padding-3)]">
      {emptyPage && !locked ? (
        <ul className="m-0 flex list-none flex-wrap justify-center gap-[var(--space-padding-3)] p-0">
          {PROMPT_PRESETS.map((preset, index) => (
            <li key={preset.key}>
              <button
                type="button"
                onClick={() => {
                  onChange(preset.prompt);
                  input.current?.focus();
                }}
                className={[
                  'cursor-pointer rounded-[var(--radius-max)] border border-solid',
                  'border-[length:var(--stroke-weight-light)] border-[color:var(--color-border-input)]',
                  'bg-[color:var(--color-background-default)] px-[var(--space-padding-5)] py-[var(--space-padding-2)]',
                  '[font:var(--text-body-b2-m)] text-[color:var(--color-font-main-text)]',
                ].join(' ')}
              >
                {COPY[PRESET_LABELS[index] ?? 'S-11a']}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <textarea
        ref={input}
        aria-label={COPY['S-08']}
        aria-describedby={reason ? reasonId : undefined}
        placeholder={emptyPage ? COPY['S-08'] : undefined}
        value={value}
        maxLength={LIMITS.PROMPT_MAX}
        rows={1}
        disabled={locked}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        className={[
          'box-border w-full resize-none rounded-[var(--radius-node)] border border-solid',
          'border-[length:var(--stroke-weight-light)] border-[color:var(--color-border-input)]',
          'bg-[color:var(--color-background-default)] shadow-[var(--shadow-prompt)]',
          'px-[var(--space-padding-8)] py-[var(--space-padding-6)]',
          '[font:var(--text-subtitle-st2-m)] text-[color:var(--color-font-main-text)]',
          'placeholder:text-[color:var(--color-font-helper-text)]',
          'disabled:cursor-not-allowed disabled:bg-[color:var(--color-gray-20)]',
          'disabled:border-[color:var(--color-border-default)] disabled:text-[color:var(--color-font-disable)]',
        ].join(' ')}
      />
      {reason ? (
        <p
          id={reasonId}
          className="m-0 [font:var(--text-body-b2-r)] text-[color:var(--color-font-sub-text)]"
        >
          {COPY[reason]}
        </p>
      ) : null}
    </div>
  );
}
