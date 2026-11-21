import { describe, expect, it } from 'vitest';
import type { Node } from '@tome/shared';
import {
  nodePad,
  nodeWeight,
  padCoordinates,
  padForKey,
  restoreNode,
  weightForKey,
  replaceEditedNode,
  reorderPriorities,
} from './edit-model';

const original: Node = {
  id: 'k1',
  kind: 'keyword',
  stage: 'analyze',
  text: 'Lamp',
  enabled: true,
  parentIds: [],
  weight: 5,
  pad: { x: 0, y: 0, xAxis: ['Textured', 'Smooth'], yAxis: ['Horizon', 'Surrounding'] },
};

describe('node editing', () => {
  it('preserves immutable fields and axes and never edits verification nodes', () => {
    const snapshot = { schemaVersion: 1 as const, subjectTemplate: 'Lamp', nodes: [original] };
    const next = replaceEditedNode(snapshot, {
      ...original,
      text: 'Changed',
      parentIds: ['k2'],
      pad: { ...nodePad(original), x: 9, xAxis: ['Other', 'Axes'] },
    });
    expect(next.nodes[0]).toMatchObject({
      text: 'Lamp',
      parentIds: [],
      pad: { x: 5, xAxis: ['Textured', 'Smooth'] },
    });
    const criterion = { ...original, id: 'v1', kind: 'criterion', stage: 'verify' } as Node;
    const verify = { ...snapshot, nodes: [criterion] };
    expect(replaceEditedNode(verify, { ...criterion, enabled: false })).toBe(verify);
  });
  it('reorders priorities without deleting disabled nodes or changing unrelated nodes', () => {
    const a = { ...original, id: 's1', kind: 'priority', stage: 'research', order: 0 } as Node;
    const b = { ...a, id: 's2', order: 1, enabled: false };
    const snapshot = {
      schemaVersion: 1 as const,
      subjectTemplate: 'Lamp',
      nodes: [original, a, b],
    };
    const next = reorderPriorities(snapshot, 's2', 's1');
    expect(next.nodes).toHaveLength(3);
    expect(next.nodes[0]).toBe(original);
    expect(next.nodes[1]!.order).toBe(1);
    expect(next.nodes[2]).toMatchObject({ order: 0, enabled: false });
    expect(reorderPriorities(snapshot, 'unknown', 's1')).toBe(snapshot);
  });
  it('handles all weight keys and stops at the boundaries', () => {
    expect(weightForKey(5, 'ArrowLeft')).toBe(4);
    expect(weightForKey(5, 'ArrowDown')).toBe(4);
    expect(weightForKey(5, 'ArrowRight')).toBe(6);
    expect(weightForKey(5, 'ArrowUp')).toBe(6);
    expect(weightForKey(5, 'Home')).toBe(0);
    expect(weightForKey(5, 'End')).toBe(9);
    expect(weightForKey(0, 'ArrowDown')).toBe(0);
    expect(weightForKey(9, 'ArrowUp')).toBe(9);
    expect(weightForKey(5, 'Tab')).toBeUndefined();
  });
  it('moves both pad axes without changing the original and resets to neutral', () => {
    const pad = { ...nodePad(original), x: -5, y: 5 };
    expect(padForKey(pad, 'ArrowLeft')).toEqual(pad);
    expect(padForKey(pad, 'ArrowUp')).toEqual(pad);
    expect(padForKey(pad, 'ArrowRight')).toMatchObject({ x: -4, y: 5 });
    expect(padForKey(pad, 'ArrowDown')).toMatchObject({ x: -5, y: 4 });
    expect(padForKey(pad, 'Home')).toMatchObject({ x: 0, y: 0 });
    expect(padForKey(pad, 'Tab')).toBeUndefined();
    expect(pad).toMatchObject({ x: -5, y: 5 });
    expect(padForKey({ ...pad, x: 5, y: -5 }, 'ArrowRight')).toMatchObject({ x: 5 });
    expect(padForKey({ ...pad, y: -5 }, 'ArrowDown')).toMatchObject({ y: -5 });
  });
  it('formats coordinates with the matching axis name and unsigned magnitude', () => {
    expect(padCoordinates({ ...nodePad(original), x: -2, y: 3 })).toEqual([
      'Textured 2',
      'Surrounding 3',
    ]);
  });
  it('uses shared fallback axes and preserves explicit zero weight', () => {
    const missing = { ...original, weight: undefined, pad: undefined };
    expect(nodeWeight(missing)).toBe(5);
    expect(nodeWeight({ ...original, weight: 0 })).toBe(0);
    expect(nodePad(missing)).toEqual(original.pad);
  });
  it('restores server initial values without changing the saved snapshot', () => {
    const saved = {
      ...original,
      weight: 9,
      aiInitial: { weight: 0, enabled: false, pad: { x: -2, y: 1 } },
    };
    const restored = restoreNode({ ...saved, weight: 3 }, saved);
    expect(restored).toMatchObject({ weight: 0, enabled: false, pad: { x: -2, y: 1 } });
    expect(saved.weight).toBe(9);
    restored.pad!.xAxis[0] = 'Other';
    expect(saved.pad!.xAxis[0]).toBe('Textured');
    expect(restoreNode({ ...original, enabled: false }, original)).toEqual(original);
    expect(() => restoreNode({ ...original, id: 'k2' }, original)).toThrow();
  });
});
