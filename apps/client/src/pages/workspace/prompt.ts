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

/** 프리셋 문장을 고치지 않고 그대로 보낼 때만 그 프리셋 키를 돌려준다. */
export function presetKeyFor(text: string): PresetKey | undefined {
  const trimmed = text.trim();
  return PROMPT_PRESETS.find((preset) => preset.prompt === trimmed)?.key;
}
