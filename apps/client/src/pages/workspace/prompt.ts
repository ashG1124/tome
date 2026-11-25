import { LIMITS, PROMPT_PRESETS, type PresetKey, type WorkspaceResponse } from '@tome/shared';

/** 프롬프트 바 상태: 입력 가능 / 생성 중이라 잠김 / 이 페이지 세트가 다 차서 비활성. */
export type PromptBarState = 'ready' | 'generating' | 'full';

export interface PromptBarInfo {
  state: PromptBarState;
  /** 이 페이지에 세트가 하나도 없으면 true. 인사말과 프리셋은 이때만 보인다. */
  emptyPage: boolean;
}

/** 워크스페이스 응답에서 프롬프트 바 상태를 정한다. 생성 중이 세트 상한보다 먼저다. */
export function promptBarInfo(workspace: WorkspaceResponse): PromptBarInfo {
  const page = workspace.pages.find((p) => p.id === workspace.currentPageId);
  const setCount = page?.setCount ?? workspace.sets.length;
  let state: PromptBarState = 'ready';
  if (workspace.activeJob !== undefined) state = 'generating';
  else if (setCount >= LIMITS.SETS_PER_PAGE) state = 'full';
  return { state, emptyPage: setCount === 0 };
}

/** 앞뒤 공백을 빼고 1~500자일 때만 보낼 수 있다. */
export function canSubmitPrompt(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= LIMITS.PROMPT_MAX;
}

/**
 * 프롬프트 바를 여러 줄 모양(글이 위, 아래 줄에 + 와 보내기)으로 바꿀지 정한다.
 * 줄바꿈이 있거나, 한 줄 모양 폭에서 잰 글 높이가 한 줄을 넘으면 여러 줄이다.
 * 폭이 다른 두 모양 사이를 오가며 깜빡이지 않도록 높이는 늘 한 줄 모양 폭에서 잰 값을 쓴다.
 */
export function isMultilinePrompt(
  text: string,
  oneLineScrollHeight: number,
  lineHeight: number,
): boolean {
  if (text.length === 0) return false;
  if (text.includes('\n')) return true;
  return lineHeight > 0 && oneLineScrollHeight > lineHeight * 1.5;
}

/** 프리셋 문장을 고치지 않고 그대로 보낼 때만 그 프리셋 키를 돌려준다. */
export function presetKeyFor(text: string): PresetKey | undefined {
  const trimmed = text.trim();
  return PROMPT_PRESETS.find((preset) => preset.prompt === trimmed)?.key;
}
