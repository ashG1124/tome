import { LIMITS, PROMPT_PRESETS, type PresetKey } from '@tome/shared';

/** 첫 프롬프트의 앞 60자로 제목을 만든다(앞뒤 공백을 정리한 뒤 자른다). */
export function makeTitle(prompt: string): string {
  let title = prompt.trim().slice(0, LIMITS.TITLE_MAX);
  // 자르다가 이모지 같은 서로게이트 쌍의 앞절반만 남지 않게 한다.
  const last = title.charCodeAt(title.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) title = title.slice(0, -1);
  return title.trim();
}

/** prompt 가 없고 presetKey 만 있으면 프리셋 문장을 프롬프트로 쓴다. */
export function resolvePrompt(prompt: string | undefined, presetKey: PresetKey | undefined) {
  if (prompt !== undefined) return prompt;
  if (presetKey === undefined) return undefined;
  return PROMPT_PRESETS.find((preset) => preset.key === presetKey)?.prompt;
}

export interface ShelfItem {
  id: string;
  shelfPosition: number;
}

/** movedId 를 목표 순번(범위를 넘으면 맨 끝)에 넣은 새 id 순서. */
export function planShelfOrder(ids: string[], movedId: string, target: number): string[] {
  const rest = ids.filter((id) => id !== movedId);
  const index = Math.min(Math.max(target, 0), rest.length);
  return [...rest.slice(0, index), movedId, ...rest.slice(index)];
}

/** 새 순서대로 0..n-1 번호를 매기되, 번호가 달라지는 행만 돌려준다. */
export function shelfChanges(items: ShelfItem[], orderedIds: string[]): ShelfItem[] {
  const current = new Map(items.map((item) => [item.id, item.shelfPosition]));
  return orderedIds
    .map((id, shelfPosition) => ({ id, shelfPosition }))
    .filter((item) => current.get(item.id) !== item.shelfPosition);
}
