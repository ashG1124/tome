import { describe, expect, it } from 'vitest';
import { LIMITS } from './common.js';
import { PROMPT_PRESETS, PresetKeySchema } from './presets.js';

describe('PROMPT_PRESETS', () => {
  it('has five presets with matching key and scenarioKey', () => {
    expect(PROMPT_PRESETS).toHaveLength(5);
    for (const p of PROMPT_PRESETS) expect(p.scenarioKey).toBe(p.key);
  });

  it('keeps every preset prompt within the prompt limit', () => {
    for (const p of PROMPT_PRESETS) expect(p.prompt.length).toBeLessThanOrEqual(LIMITS.PROMPT_MAX);
  });

  it('validates preset keys', () => {
    expect(PresetKeySchema.safeParse('sofa').success).toBe(true);
    expect(PresetKeySchema.safeParse('unknown').success).toBe(false);
  });
});
