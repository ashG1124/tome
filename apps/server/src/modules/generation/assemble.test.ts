import type { Node } from '@tome/shared';
import { describe, expect, it } from 'vitest';
import { ASSEMBLED_PROMPT_MAX, assemblePrompt, phraseOf, tidySubject } from './assemble';
import { EDIT_PREFIX, editInstruction } from './edit-instruction';

const keyword = (
  id: string,
  text: string,
  weight: number,
  opts: { enabled?: boolean; x?: number; y?: number } = {},
): Node => ({
  id,
  stage: 'analyze',
  kind: 'keyword',
  text,
  enabled: opts.enabled ?? true,
  weight,
  pad: { x: opts.x ?? 0, y: opts.y ?? 0, xAxis: ['calm', 'energetic'], yAxis: ['dry', 'wet'] },
  parentIds: [],
});
const attribute = (id: string, text: string, weight: number, enabled = true): Node => ({
  id,
  stage: 'draft',
  kind: 'attribute',
  text,
  enabled,
  weight,
  category: 'x',
  parentIds: [],
});
const other = (id: string, kind: Node['kind'], stage: Node['stage']): Node => ({
  id,
  stage,
  kind,
  text: 'ignored',
  enabled: true,
  parentIds: [],
});

describe('assemblePrompt (same rules as the measured S1 assembler)', () => {
  it('example 1: strength words, pad adjectives, weight-then-kind-then-id order', () => {
    const result = assemblePrompt('a lighthouse over {k2}', [
      keyword('k1', 'lighthouse', 9),
      keyword('k2', 'stormy sea', 5, { x: -3, y: 5 }),
      keyword('k3', 'no text', 2, { x: 1 }),
      keyword('k4', 'gulls', 6, { enabled: false }),
      attribute('a1', 'dusk light', 7),
      attribute('a2', 'rough waves', 0),
      attribute('a3', 'mist', 4),
      other('e1', 'evidence', 'evidence'),
    ]);
    expect(result.assembledPrompt).toBe(
      'a lighthouse over stormy sea. strongly emphasized lighthouse, strongly emphasized dusk light, stormy sea (calm, extremely wet), mist, a subtle touch of no text (slightly energetic).',
    );
    expect(result.phrases).toEqual({
      k1: 'strongly emphasized lighthouse',
      a1: 'strongly emphasized dusk light',
      k2: 'stormy sea (calm, extremely wet)',
      a3: 'mist',
      k3: 'a subtle touch of no text (slightly energetic)',
    });
    expect(result.excluded).toEqual([
      { id: 'k4', reason: 'off' },
      { id: 'a2', reason: 'weight0' },
      { id: 'e1', reason: 'evidence-excluded' },
    ]);
  });

  it('example 2: fills the subject with keyword text (not the phrase)', () => {
    const result = assemblePrompt('{k1} over {k2}', [
      keyword('k1', 'lighthouse', 7, { x: 4 }),
      keyword('k2', 'stormy sea', 5),
    ]);
    expect(result.assembledPrompt).toBe(
      'lighthouse over stormy sea. strongly emphasized lighthouse (energetic), stormy sea.',
    );
  });

  it('example 3: weight ties keep keywords before attributes, then id order', () => {
    const result = assemblePrompt('{k1}', [
      attribute('a1', 'b', 5),
      keyword('k2', 'c', 5),
      keyword('k1', 'a', 5),
    ]);
    expect(result.assembledPrompt).toBe('a. a, c, b.');
    expect(Object.keys(result.phrases)).toEqual(['k1', 'k2', 'a1']);
  });

  it('does not list dataType and priority nodes anywhere', () => {
    const result = assemblePrompt('{k1}', [
      keyword('k1', 'a', 5),
      other('d1', 'dataType', 'research'),
      other('s1', 'priority', 'research'),
    ]);
    expect(result.excluded).toEqual([]);
    expect(result.phrases).not.toHaveProperty('d1');
    expect(result.phrases).not.toHaveProperty('s1');
  });

  it('removes a disabled keyword from the subject and cleans the punctuation', () => {
    const result = assemblePrompt('{k1} in {k2}, with {k3}', [
      keyword('k1', 'a fox', 8),
      keyword('k2', 'snow', 6, { enabled: false }),
      keyword('k3', 'dusk light', 6),
    ]);
    expect(result.assembledPrompt).toBe(
      'a fox in, with dusk light. strongly emphasized a fox, dusk light.',
    );
    expect(result.excluded).toEqual([{ id: 'k2', reason: 'off' }]);
    expect(result.phrases).not.toHaveProperty('k2');
  });

  it('drops the lowest-ranked phrases first when the prompt is too long', () => {
    const long = 'x'.repeat(1500);
    const result = assemblePrompt('{k1}', [
      keyword('k1', 'subject', 9),
      attribute('a1', long, 8),
      attribute('a2', long, 5),
      attribute('a3', long, 1),
    ]);
    expect(result.assembledPrompt.length).toBeLessThanOrEqual(ASSEMBLED_PROMPT_MAX);
    expect(result.excluded).toEqual([
      { id: 'a3', reason: 'length' },
      { id: 'a2', reason: 'length' },
    ]);
    expect(Object.keys(result.phrases).sort()).toEqual(['a1', 'k1']);
  });

  it('is deterministic', () => {
    const nodes = [keyword('k1', 'a', 5), attribute('a1', 'b', 3), attribute('a2', 'c', 3)];
    expect(assemblePrompt('{k1}', nodes)).toEqual(assemblePrompt('{k1}', nodes));
  });

  it('uses weight 5 when a weight is missing', () => {
    const node: Node = { ...attribute('a1', 'mist', 5), weight: undefined };
    expect(phraseOf(node)).toBe('mist');
  });
});

describe('tidySubject', () => {
  it.each([
    ['a fox in , with dusk light', 'a fox in, with dusk light'],
    ['a fox ( ) in snow', 'a fox in snow'],
    [', a fox ,, snow ,', 'a fox, snow'],
    ['  a   fox  .', 'a fox'],
    ['', ''],
  ])('%j -> %j', (input, expected) => {
    expect(tidySubject(input)).toBe(expected);
  });
});

describe('editInstruction', () => {
  it('describes change, remove and add in id order of appearance', () => {
    const result = editInstruction(
      { k1: 'lighthouse', a1: 'dusk light', a2: 'mist' },
      { k1: 'lighthouse', a1: 'dawn light', k2: 'gulls' },
    );
    expect(result.instruction).toBe(
      `${EDIT_PREFIX}change "dusk light" to "dawn light"; remove "mist"; add "gulls".`,
    );
    expect(result.changes.map((c) => c.kind)).toEqual(['change', 'remove', 'add']);
  });

  it('skips identical prompts', () => {
    expect(editInstruction({ k1: 'a' }, { k1: 'a' })).toEqual({
      instruction: null,
      skipped: 'identical-prompt',
      changes: [],
    });
  });
});
