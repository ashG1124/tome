import { describe, expect, it } from 'vitest';
import { commentableNodeIds } from './comments.rules';

const node = (id: string, kind = 'keyword') => ({
  id,
  stage: 'keyword',
  kind,
  text: id,
  enabled: true,
  parentIds: [],
});

describe('commentableNodeIds', () => {
  it('collects snapshot nodes and verification criteria, not mismatches', () => {
    const ids = commentableNodeIds({
      nodes: { schemaVersion: 1, nodes: [node('k1'), node('s1', 'priority')] },
      verification: {
        status: 'done',
        criteria: [node('v1', 'criterion'), node('v2', 'criterion')],
        mismatches: [node('m1', 'mismatch')],
      },
    });
    expect([...ids].sort()).toEqual(['k1', 's1', 'v1', 'v2']);
    expect(ids.has('m1')).toBe(false);
  });

  it('works without a verification record', () => {
    expect([...commentableNodeIds({ nodes: { nodes: [node('k1')] }, verification: null })]).toEqual(
      ['k1'],
    );
  });

  it('ignores malformed JSON values', () => {
    expect(commentableNodeIds({ nodes: null, verification: { criteria: 'x' } }).size).toBe(0);
    expect(
      commentableNodeIds({
        nodes: { nodes: [null, { id: 3 }, { id: 'k2' }] },
        verification: { criteria: [{}, { id: 'v1' }] },
      }),
    ).toEqual(new Set(['k2', 'v1']));
  });
});
