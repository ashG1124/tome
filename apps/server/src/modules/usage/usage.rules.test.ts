import { PROMPT_PRESETS } from '@tome/shared';
import { describe, expect, it } from 'vitest';
import {
  costUsdFromNeurons,
  decideLimit,
  estimateNeurons,
  matchPreset,
  normalizePrompt,
} from './usage.rules';

describe('costUsdFromNeurons', () => {
  it('is 0 up to the free allocation, then 0.011 per 1,000 neurons above it', () => {
    expect(costUsdFromNeurons(0)).toBe(0);
    expect(costUsdFromNeurons(9_999)).toBe(0);
    expect(costUsdFromNeurons(10_000)).toBe(0);
    expect(costUsdFromNeurons(10_001)).toBeCloseTo(0.000011, 9);
    expect(costUsdFromNeurons(20_000)).toBeCloseTo(0.11, 9);
  });
});

describe('decideLimit', () => {
  const caps = { dailyNeuronCap: 100, monthlyCostCapUsd: 5 };
  it('passes below both caps', () => {
    expect(decideLimit({ todayNeurons: 99, monthCostUsd: 4.99 }, caps).code).toBeNull();
  });
  it('daily cap is inclusive', () => {
    expect(decideLimit({ todayNeurons: 100, monthCostUsd: 0 }, caps).code).toBe(
      'DAILY_LIMIT_REACHED',
    );
  });
  it('budget wins when both are reached', () => {
    const r = decideLimit({ todayNeurons: 500, monthCostUsd: 5 }, caps);
    expect(r).toEqual({ budgetReached: true, dailyLimitReached: true, code: 'BUDGET_REACHED' });
  });
});

describe('matchPreset', () => {
  const preset = PROMPT_PRESETS[1];
  it('matches the exact sentence', () => {
    expect(matchPreset(preset.key, preset.prompt)).toBe(preset.key);
  });
  it('ignores case, outer and repeated whitespace', () => {
    expect(matchPreset(preset.key, `  ${preset.prompt.toUpperCase().replace(/ /g, '   ')}\n`)).toBe(
      preset.key,
    );
  });
  it('rejects a one-character difference', () => {
    expect(matchPreset(preset.key, preset.prompt.slice(0, -1))).toBeNull();
    expect(matchPreset(preset.key, `${preset.prompt}.`)).toBeNull();
  });
  it('needs a known presetKey; another preset sentence does not match', () => {
    expect(matchPreset(null, preset.prompt)).toBeNull();
    expect(matchPreset(undefined, preset.prompt)).toBeNull();
    expect(matchPreset('nope', preset.prompt)).toBeNull();
    expect(matchPreset(PROMPT_PRESETS[0].key, preset.prompt)).toBeNull();
  });
  it('normalization does not strip punctuation', () => {
    expect(normalizePrompt('  A,  B ')).toBe('a, b');
  });
});

describe('estimateNeurons', () => {
  it('prefers the reported value, zero for mock, table for known models', () => {
    expect(estimateNeurons('workers-ai', 'x', 12)).toBe(12);
    expect(estimateNeurons('mock', 'mock')).toBe(0);
    expect(estimateNeurons('workers-ai', '@cf/black-forest-labs/flux-1-schnell')).toBe(57.6);
    expect(estimateNeurons('workers-ai', 'unknown')).toBe(0);
  });
});
