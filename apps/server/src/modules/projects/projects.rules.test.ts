import { LIMITS, PROMPT_PRESETS } from '@tome/shared';
import { describe, expect, it } from 'vitest';
import { makeTitle, planShelfOrder, resolvePrompt, shelfChanges } from './projects.rules';

describe('makeTitle', () => {
  it('keeps a short prompt as is', () => {
    expect(makeTitle('A red fox')).toBe('A red fox');
  });

  it('trims surrounding whitespace before cutting', () => {
    expect(makeTitle('   A red fox  \n')).toBe('A red fox');
    expect(makeTitle(`  ${'a'.repeat(70)}`)).toBe('a'.repeat(LIMITS.TITLE_MAX));
  });

  it('cuts at exactly 60 characters', () => {
    expect(makeTitle('a'.repeat(60))).toHaveLength(60);
    expect(makeTitle('a'.repeat(61))).toHaveLength(60);
    expect(makeTitle('가'.repeat(100))).toBe('가'.repeat(60));
  });

  it('does not leave trailing whitespace or half an emoji', () => {
    expect(makeTitle(`${'a'.repeat(59)} b`)).toBe('a'.repeat(59));
    const cut = makeTitle(`${'a'.repeat(59)}😀`);
    expect(cut).toBe('a'.repeat(59));
  });
});

describe('resolvePrompt', () => {
  it('uses the prompt when given, even with a preset', () => {
    expect(resolvePrompt('mine', 'sofa')).toBe('mine');
  });

  it('turns a preset key into the preset sentence', () => {
    const preset = PROMPT_PRESETS.find((p) => p.key === 'sofa')!;
    expect(resolvePrompt(undefined, 'sofa')).toBe(preset.prompt);
  });

  it('is undefined with neither', () => {
    expect(resolvePrompt(undefined, undefined)).toBeUndefined();
  });
});

describe('planShelfOrder', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('moves to the front', () => {
    expect(planShelfOrder(ids, 'c', 0)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('moves to the middle', () => {
    expect(planShelfOrder(ids, 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves to the end', () => {
    expect(planShelfOrder(ids, 'a', 3)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('clamps a target beyond the end to the last slot', () => {
    expect(planShelfOrder(ids, 'b', 99)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('keeps the order when the target is the current slot', () => {
    expect(planShelfOrder(ids, 'b', 1)).toEqual(ids);
  });

  it('handles a single project', () => {
    expect(planShelfOrder(['a'], 'a', 5)).toEqual(['a']);
  });
});

describe('shelfChanges', () => {
  it('returns only rows whose number changes', () => {
    const items = [
      { id: 'a', shelfPosition: 0 },
      { id: 'b', shelfPosition: 1 },
      { id: 'c', shelfPosition: 2 },
    ];
    expect(shelfChanges(items, ['a', 'c', 'b'])).toEqual([
      { id: 'c', shelfPosition: 1 },
      { id: 'b', shelfPosition: 2 },
    ]);
  });

  it('closes gaps left by a removed row', () => {
    const items = [
      { id: 'a', shelfPosition: 0 },
      { id: 'c', shelfPosition: 2 },
    ];
    expect(shelfChanges(items, ['a', 'c'])).toEqual([{ id: 'c', shelfPosition: 1 }]);
  });
});
