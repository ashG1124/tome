import { describe, expect, it } from 'vitest';
import { LIMITS } from './common.js';
import { PROMPT_PRESETS, PresetKeySchema, presetPrompts } from './presets.js';

describe('PROMPT_PRESETS', () => {
  it('has five presets with matching key and scenarioKey', () => {
    expect(PROMPT_PRESETS).toHaveLength(5);
    for (const p of PROMPT_PRESETS) expect(p.scenarioKey).toBe(p.key);
  });

  it('keeps every preset prompt within the prompt limit', () => {
    for (const p of PROMPT_PRESETS) expect(p.prompt.length).toBeLessThanOrEqual(LIMITS.PROMPT_MAX);
  });

  it('keeps earlier sentences apart from the current one and within the limit (#264)', () => {
    for (const p of PROMPT_PRESETS) {
      const earlier: readonly string[] = p.previousPrompts;
      expect(earlier).not.toContain(p.prompt);
      for (const text of earlier) expect(text.length).toBeLessThanOrEqual(LIMITS.PROMPT_MAX);
    }
    // 한 문장이 두 프리셋에 걸리지 않는다.
    const all = PROMPT_PRESETS.flatMap((p) => presetPrompts(p.key));
    expect(new Set(all).size).toBe(all.length);
  });

  it('presetPrompts lists the current sentence first, then the earlier ones (#264)', () => {
    const lamp = PROMPT_PRESETS.find((p) => p.key === 'desk-lamp')!;
    expect(presetPrompts('desk-lamp')).toEqual([lamp.prompt, ...lamp.previousPrompts]);
    expect(presetPrompts('desk-lamp').length).toBeGreaterThan(1);
    expect(presetPrompts('sofa')).toEqual([PROMPT_PRESETS.find((p) => p.key === 'sofa')!.prompt]);
    expect(presetPrompts('unknown')).toEqual([]);
  });

  it('validates preset keys', () => {
    expect(PresetKeySchema.safeParse('sofa').success).toBe(true);
    expect(PresetKeySchema.safeParse('unknown').success).toBe(false);
  });
});
