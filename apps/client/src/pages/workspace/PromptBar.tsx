import { LIMITS, PROMPT_PRESETS, type PresetKey } from '@tome/shared';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { COPY, type CopyKey } from '../../shared/copy';
import { Icon } from '../../shared/ui';
import { SparkleIcon } from './PromptIcons';
import { canSubmitPrompt, presetKeyFor, type PromptBarState } from './prompt';
import { PersonPhoto, type RemixPerson } from './remix/RemixPanel';

/** 프리셋 탭 이름 문구. PROMPT_PRESETS 순서와 같다. */
const PRESET_LABELS: readonly CopyKey[] = ['S-11a', 'S-11b', 'S-11c', 'S-11d', 'S-11e'];

/** 잠긴 이유 한 줄. 입력 가능할 때는 없다. */
const REASON: Record<PromptBarState, CopyKey | null> = {
  ready: null,
  generating: 'S-03',
  full: 'S-09',
};

/** 리믹스 상대가 있는 빈 페이지에서 반짝이 자리에 두는 상대 칩(프롬프트 바 remix 변형 4898:93342). */
export interface PromptRemixChip {
  partner: RemixPerson;
  /** 리믹스 패널이 열려 있는지(열리면 아래 화살표) */
  open: boolean;
  panelId: string;
  onToggle: () => void;
}

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
  /** 로그인한 사람 이름. 있으면 자리 문구가 "Hello, 이름. …"이 된다(시안 1187:61881). */
  greetingName?: string;
  /** 리믹스 상대. 빈 페이지면 상대 칩과 "Start a new project with 이름"(FG-04)을 보인다 */
  remix?: PromptRemixChip;
}

/**
 * 프롬프트 바 리믹스 칩(4898:93342·4897:96773·4706:159190): 반투명 흰 알약(여백 4) 안 32 사진.
 * 손을 올리거나 키보드로 오면 오른쪽 화살표(4897:96773), 리믹스 패널이 열려 있으면 아래 화살표(4706:159190).
 * 누르면 리믹스 패널을 열고 닫는다(상대 바꾸기).
 */
function RemixChip({ chip, disabled }: { chip: PromptRemixChip; disabled: boolean }) {
  return (
    <button
      type="button"
      data-remix-opener=""
      aria-label={`${COPY['RX-01']} ${chip.partner.displayName}`}
      aria-expanded={chip.open}
      aria-controls={chip.open ? chip.panelId : undefined}
      disabled={disabled}
      onClick={chip.onToggle}
      className={[
        'group my-[calc((var(--font-size-b2)*var(--line-height-default)-var(--size-prompt-remix-chip))/2)] flex shrink-0 cursor-pointer items-center',
        'rounded-[var(--radius-max)] border-0 bg-[color:var(--color-glass)] p-[var(--space-padding-2)] text-[color:var(--color-font-sub-text)]',
        'disabled:cursor-not-allowed',
      ].join(' ')}
    >
      <PersonPhoto
        person={chip.partner}
        className="size-[var(--size-avatar-thumb)] border-0 bg-[color:var(--color-fill-brand-weak)]"
      />
      {chip.open ? (
        <Icon name="arrow-down" size={ARROW_SIZE} />
      ) : (
        <span className="hidden group-hover:flex group-focus-visible:flex group-disabled:hidden">
          <Icon name="arrow-right" size={ARROW_SIZE} />
        </span>
      )}
    </button>
  );
}

/** 칩 안 화살표 한 변(px). 시안 4706:159231 의 20 */
const ARROW_SIZE = 20;

/** 마지막 입력이 키보드였는지. 키보드로 들어왔을 때만 포커스 테두리를 보이려고 쓴다. */
let lastInputWasKeyboard = false;
let trackers = 0;
function trackInputKind(): () => void {
  const key = () => {
    lastInputWasKeyboard = true;
  };
  const pointer = () => {
    lastInputWasKeyboard = false;
  };
  if (trackers++ === 0) {
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', pointer, true);
  }
  return () => {
    if (--trackers === 0) {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', pointer, true);
    }
  };
}

/**
 * 워크스페이스 하단 프롬프트 바. Enter 로 보내고 Shift+Enter 는 줄바꿈이다.
 * 보내는 중에는 연달아 눌러도 한 번만 보낸다.
 */
export function PromptBar({
  state,
  emptyPage,
  value,
  onChange,
  onSubmit,
  greetingName,
  remix,
}: PromptBarProps) {
  const input = useRef<HTMLTextAreaElement>(null);
  // 입력칸 안쪽에는 포커스 사각형을 그리지 않는다. 키보드로 들어왔을 때만 알약 바깥에 테두리를 보인다.
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  useEffect(() => trackInputKind(), []);
  const chip = emptyPage ? remix : undefined;
  const placeholder =
    chip !== undefined
      ? COPY['FG-04'].replace('{name}', chip.partner.displayName)
      : greetingName === undefined
        ? COPY['S-08']
        : COPY['FG-01'].replace('{name}', greetingName);
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
    <div className="relative">
      {emptyPage && !locked && !busy ? (
        <ul className="absolute bottom-full left-0 mb-[var(--space-padding-3)] m-0 flex w-full list-none flex-wrap justify-center gap-[var(--space-padding-3)] p-0">
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
        data-keyboard-focus={keyboardFocus || undefined}
        className={[
          'box-border flex min-h-[var(--size-prompt-pill-height)] w-full items-start gap-[var(--space-gap-4)] rounded-[var(--radius-prompt-pill)]',
          'bg-[color:var(--color-glass)] py-[var(--space-padding-6)] pr-[var(--space-padding-7)] backdrop-blur-[var(--blur-background)]',
          // 리믹스 칩이 있으면 왼쪽 여백 12(4706:159193), 없으면 20
          chip ? 'pl-[var(--space-padding-5)]' : 'pl-[var(--space-padding-7)]',
          'shadow-[var(--shadow-prompt)] text-[color:var(--color-font-sub-text)]',
          'data-[keyboard-focus]:outline data-[keyboard-focus]:outline-2 data-[keyboard-focus]:outline-offset-2 data-[keyboard-focus]:outline-[color:var(--color-border-input)]',
          locked ? 'bg-[color:var(--color-gray-20)] text-[color:var(--color-font-disable)]' : '',
        ].join(' ')}
      >
        {chip ? (
          <RemixChip chip={chip} disabled={locked} />
        ) : (
          <span className="mt-[calc(var(--space-gap-1)/2)] flex">
            <SparkleIcon />
          </span>
        )}
        <textarea
          ref={input}
          aria-label={COPY['S-08']}
          aria-describedby={reason ? reasonId : undefined}
          placeholder={placeholder}
          value={value}
          maxLength={LIMITS.PROMPT_MAX}
          rows={1}
          disabled={locked}
          readOnly={busy}
          aria-busy={busy || undefined}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setKeyboardFocus(lastInputWasKeyboard)}
          onBlur={() => setKeyboardFocus(false)}
          className={[
            'm-0 box-border block max-h-[40vh] min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent p-0 outline-none focus-visible:outline-none!',
            '[font:var(--text-subtitle-st2-m)] tracking-[var(--letter-spacing-default)] text-[color:var(--color-font-main-text)]',
            'placeholder:text-[color:var(--color-font-helper-text)]',
            'disabled:cursor-not-allowed disabled:text-[color:var(--color-font-disable)]',
          ].join(' ')}
        />
        {/* 음성 입력은 아직 기능이 없다. 시안 모양(1187:61882)만 두고 비활성으로 알린다. */}
        <button
          type="button"
          aria-label={COPY['FG-03']}
          aria-disabled="true"
          className="mt-[calc(var(--space-gap-1)/2)] flex shrink-0 cursor-not-allowed border-0 bg-transparent p-0 text-[color:var(--color-font-sub-text)]"
        >
          <Icon name="mic" />
        </button>
      </div>
      {reason ? (
        <p
          id={reasonId}
          className="absolute top-full left-0 mt-[var(--space-padding-3)] m-0 w-full text-center [font:var(--text-body-b2-r)] text-[color:var(--color-font-sub-text)]"
        >
          {COPY[reason]}
        </p>
      ) : null}
    </div>
  );
}
