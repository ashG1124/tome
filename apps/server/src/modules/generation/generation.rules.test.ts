import { type Node, VerificationSchema } from '@tome/shared';
import { describe, expect, it } from 'vitest';
import { ASSEMBLED_PROMPT_MAX, assemblePrompt } from './assemble';
import { STAGE_ORDER, nextStageOf } from './stages';
import { buildVerification } from './verify';

const keyword = (id: string, text: string, enabled = true): Node => ({
  id,
  stage: 'analyze',
  kind: 'keyword',
  text,
  enabled,
  weight: 5,
  parentIds: [],
});
const attribute = (id: string, text: string, weight: number, enabled = true): Node => ({
  id,
  stage: 'draft',
  kind: 'attribute',
  text,
  enabled,
  weight,
  parentIds: [],
});

describe('assemblePrompt', () => {
  it('fills the subject template and joins attributes by weight (high first)', () => {
    const result = assemblePrompt('{k1} over {k2}', [
      keyword('k1', 'lighthouse'),
      keyword('k2', 'stormy sea'),
      attribute('a1', 'dusk light', 3),
      attribute('a2', 'rough waves', 8),
    ]);
    expect(result.assembledPrompt).toBe('lighthouse over stormy sea, rough waves, dusk light');
    expect(result.phrases).toEqual({
      k1: 'lighthouse',
      k2: 'stormy sea',
      a1: 'dusk light',
      a2: 'rough waves',
    });
    expect(result.excluded).toEqual([]);
  });

  it('removes a disabled keyword from the template and lists it as off', () => {
    const result = assemblePrompt('{k1} and {k2}', [
      keyword('k1', 'lighthouse'),
      keyword('k2', 'sea', false),
    ]);
    expect(result.assembledPrompt).toBe('lighthouse and');
    expect(result.phrases).toEqual({ k1: 'lighthouse' });
    expect(result.excluded).toEqual([{ id: 'k2', reason: 'off' }]);
  });

  it('excludes disabled attributes (off) and weight 0 attributes (weight0)', () => {
    const result = assemblePrompt('{k1}', [
      keyword('k1', 'lighthouse'),
      attribute('a1', 'dusk', 4, false),
      attribute('a2', 'fog', 0),
      attribute('a3', 'waves', 2),
    ]);
    expect(result.assembledPrompt).toBe('lighthouse, waves');
    expect(result.excluded).toEqual([
      { id: 'a1', reason: 'off' },
      { id: 'a2', reason: 'weight0' },
    ]);
    expect(result.phrases.a1).toBeUndefined();
    expect(result.phrases.a2).toBeUndefined();
  });

  it('drops the lowest-weight attributes first when the prompt is too long', () => {
    const long = 'x'.repeat(1500);
    const result = assemblePrompt('{k1}', [
      keyword('k1', 'subject'),
      attribute('a1', long, 9),
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
    const nodes = [keyword('k1', 'a'), attribute('a1', 'b', 3), attribute('a2', 'c', 3)];
    expect(assemblePrompt('{k1}', nodes)).toEqual(assemblePrompt('{k1}', nodes));
    expect(assemblePrompt('{k1}', nodes).assembledPrompt).toBe('a, b, c');
  });
});

describe('buildVerification', () => {
  it('makes one criterion per enabled draft attribute and marks the status skipped', () => {
    const verification = buildVerification([
      keyword('k1', 'lighthouse'),
      attribute('a1', 'dusk light', 6),
      attribute('a2', 'rough waves', 4, false),
      attribute('a3', 'mist', 0),
    ]);
    expect(VerificationSchema.safeParse(verification).success).toBe(true);
    expect(verification.status).toBe('skipped');
    expect(verification.mismatches).toEqual([]);
    expect(verification.criteria.map((c) => [c.id, c.parentIds])).toEqual([
      ['v1', ['a1']],
      ['v2', ['a3']],
    ]);
    expect(verification.criteria[0]).toMatchObject({
      stage: 'verify',
      kind: 'criterion',
      enabled: true,
    });
  });
});

describe('stage order', () => {
  it('runs analyze → research → evidence → draft → assemble → image → verify', () => {
    expect(STAGE_ORDER).toEqual([
      'analyze',
      'research',
      'evidence',
      'draft',
      'assemble',
      'image',
      'verify',
    ]);
  });

  it('gives the next stage, and null after verify', () => {
    expect(nextStageOf('analyze')).toBe('research');
    expect(nextStageOf('draft')).toBe('assemble');
    expect(nextStageOf('image')).toBe('verify');
    expect(nextStageOf('verify')).toBeNull();
  });
});
