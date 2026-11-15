import { type Node, VerificationSchema } from '@tome/shared';
import { describe, expect, it } from 'vitest';
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
