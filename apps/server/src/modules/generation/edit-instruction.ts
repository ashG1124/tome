import type { Phrases } from '@tome/shared';

export const EDIT_PREFIX =
  'Edit image 0. Keep the composition, camera angle, framing, subject, background and every other element exactly the same. Only change this: ';

export interface EditChange {
  kind: 'change' | 'remove' | 'add';
  id: string;
  old?: string;
  new?: string;
}

export type EditInstructionResult =
  | { instruction: string; changes: EditChange[] }
  | { instruction: null; skipped: 'identical-prompt'; changes: [] };

/**
 * 기준 답변과 변형 답변의 phrases 를 비교해 편집 지시문을 만든다(순수 함수, T6 에서 연결).
 */
export function editInstruction(base: Phrases, variant: Phrases): EditInstructionResult {
  const ids = [...new Set([...Object.keys(base), ...Object.keys(variant)])];
  const changes: EditChange[] = [];
  for (const id of ids) {
    const before = base[id];
    const after = variant[id];
    if (before !== undefined && after !== undefined) {
      if (before !== after) changes.push({ kind: 'change', id, old: before, new: after });
    } else if (before !== undefined) {
      changes.push({ kind: 'remove', id, old: before });
    } else if (after !== undefined) {
      changes.push({ kind: 'add', id, new: after });
    }
  }
  if (changes.length === 0) return { instruction: null, skipped: 'identical-prompt', changes: [] };
  const parts = changes.map((c) =>
    c.kind === 'change'
      ? `change "${c.old}" to "${c.new}"`
      : c.kind === 'remove'
        ? `remove "${c.old}"`
        : `add "${c.new}"`,
  );
  return { instruction: `${EDIT_PREFIX}${parts.join('; ')}.`, changes };
}
