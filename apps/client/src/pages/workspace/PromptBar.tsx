import { LIMITS, PROMPT_PRESETS, type PresetKey } from '@tome/shared';
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { COPY, type CopyKey } from '../../shared/copy';
import { SparkleIcon } from './PromptIcons';
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
  // 글이 길어지면 칸이 내용만큼 늘어난다(화면 높이의 40% 까지, 그 뒤로는 칸 안에서 스크롤).
  // 프리셋처럼 글이 한꺼번에 바뀔 때도 맞춘다.
  useLayoutEffect(() => {
    const element = input.current;
    if (element === null) return;
    element.style.height = 'auto';
    const border = element.offsetHeight - element.clientHeight;
    if (element.scrollHeight > 0) element.style.height = `${element.scrollHeight + border}px`;
  }, [value]);
  const sending = useRef(false);
  // 보내는 동안 입력칸을 읽기 전용으로 둔다. 보내기가 성공하면 칸을 비우므로, 그사이 친 글이 사라지지 않게.
  // 서버가 먼저 입력 안전 검사를 해서 응답이 몇 초 늦을 수 있으니, 응답을 기다리지 않고 바로 "생성 중"(S-03)을 보여 준다.
  const [busy, setBusy] = useState(false);
  const reasonId = useId();
  const reason = busy ? REASON.generating : REASON[state];
  const locked = state !== 'ready';

  const submit = async () => {
    if (locked || sending.current || !canSubmitPrompt(value)) return;
    sending.current = true;
    setBusy(true);
    try {
      const prompt = value.trim();
      const presetKey = presetKeyFor(prompt);
      await onSubmit(presetKey === undefined ? { prompt } : { prompt, presetKey });
    } finally {
      sending.current = false;
      setBusy(false);
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
      {emptyPage && !locked && !busy ? (
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
      <div
        className={[
          'box-border flex w-full items-start gap-[var(--space-gap-4)] rounded-[var(--radius-dialog)]',
          'bg-[color:var(--color-background-default)] px-[var(--space-padding-7)] py-[var(--space-padding-6)]',
          'shadow-[var(--shadow-prompt)] text-[color:var(--color-font-main-text)]',
          'focus-within:outline focus-within:outline-2 focus-within:outline-[color:var(--color-border-dark)]',
          locked ? 'bg-[color:var(--color-gray-20)] text-[color:var(--color-font-disable)]' : '',
        ].join(' ')}
      >
        <span className="mt-[calc(var(--space-gap-1)/2)] flex">
          <SparkleIcon />
        </span>
        <textarea
          ref={input}
          aria-label={COPY['S-08']}
          aria-describedby={reason ? reasonId : undefined}
          placeholder={COPY['S-08']}
          value={value}
          maxLength={LIMITS.PROMPT_MAX}
          rows={1}
          disabled={locked}
          readOnly={busy}
          aria-busy={busy || undefined}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          className={[
            'm-0 box-border block max-h-[40vh] min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent p-0 outline-none',
            '[font:var(--text-subtitle-st2-m)] text-[color:var(--color-font-main-text)]',
            'placeholder:text-[color:var(--color-font-helper-text)]',
            'disabled:cursor-not-allowed disabled:text-[color:var(--color-font-disable)]',
          ].join(' ')}
        />
      </div>
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
