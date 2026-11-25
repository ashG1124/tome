import { describe, expect, it } from 'vitest';
import type { CanvasNode, CardData } from './model';
import { dragMembers, dragOffset, dragSource, dragUnits, withDragOffset } from './drag-model';

const labels = {} as CardData['labels'];
function node(id: string, data: Partial<CardData> & Pick<CardData, 'kind' | 'column'>): CanvasNode {
  return {
    id,
    type: 'card',
    position: { x: 0, y: 0 },
    data: { setId: 's', row: 0, label: id, labels, ...data },
  };
}

const nodes = [
  node('prompt', { kind: 'prompt', column: 0 }),
  node('pill-1', { kind: 'heading', variant: 'step', column: 1 }),
  node('g-a', { kind: 'heading', variant: 'group', column: 1, group: 'a' }),
  node('k1', { kind: 'output', column: 1, group: 'a' }),
  node('k2', { kind: 'output', column: 1, group: 'a' }),
  node('g-b', { kind: 'heading', variant: 'group', column: 1, group: 'b' }),
  node('d1', { kind: 'output', column: 1, group: 'b' }),
  node('pill-2', { kind: 'heading', variant: 'step', column: 2 }),
  node('p2', { kind: 'placeholder', column: 2 }),
  node('origin-heading', { kind: 'heading', variant: 'origin', column: 6 }),
  node('origin', { kind: 'origin', column: 6 }),
  node('answer-heading', { kind: 'heading', variant: 'answer', column: 6 }),
  node('answer', { kind: 'answer', column: 6 }),
  node('other-set-k1', { kind: 'output', column: 1, group: 'a', setId: 't' }),
];
const get = (id: string) => nodes.find((entry) => entry.id === id)!;

describe('drag rules (#230)', () => {
  it('only upper nodes and the prompt/answers start a drag', () => {
    expect(nodes.filter((entry) => dragSource(entry.data)).map((entry) => entry.id)).toEqual([
      'prompt',
      'pill-1',
      'g-a',
      'g-b',
      'pill-2',
      'origin',
      'answer',
    ]);
  });

  it('a step pill carries its whole column of the same set', () => {
    expect(dragMembers(nodes, 'pill-1')).toEqual(['g-a', 'k1', 'k2', 'g-b', 'd1']);
    expect(dragMembers(nodes, 'pill-2')).toEqual(['p2']);
  });

  it('a group label carries only the cards of its group', () => {
    expect(dragMembers(nodes, 'g-a')).toEqual(['k1', 'k2']);
    expect(dragMembers(nodes, 'g-b')).toEqual(['d1']);
  });

  it('the prompt moves alone; answer cards bring their heading', () => {
    expect(dragMembers(nodes, 'prompt')).toEqual([]);
    expect(dragMembers(nodes, 'answer')).toEqual(['answer-heading']);
    expect(dragMembers(nodes, 'origin')).toEqual(['origin-heading']);
  });

  it('lower nodes never move on their own', () => {
    expect(dragMembers(nodes, 'k1')).toEqual([]);
    expect(dragMembers(nodes, 'p2')).toEqual([]);
    expect(dragMembers(nodes, 'answer-heading')).toEqual([]);
  });

  it('sums the offsets of every unit a node belongs to', () => {
    const offsets = new Map([
      ['s:column:1', { x: 10, y: 5 }],
      ['s:group:a', { x: -3, y: 40 }],
      ['s:answer', { x: 7, y: 7 }],
    ]);
    expect(dragUnits(get('k1').data)).toEqual(['s:column:1', 's:group:a']);
    expect(dragOffset(offsets, get('k1').data)).toEqual({ x: 7, y: 45 });
    expect(dragOffset(offsets, get('d1').data)).toEqual({ x: 10, y: 5 });
    expect(dragOffset(offsets, get('answer-heading').data)).toEqual({ x: 7, y: 7 });
    expect(dragOffset(offsets, get('other-set-k1').data)).toEqual({ x: 0, y: 0 });
  });

  it('places a node at its dragged spot, or returns it untouched (#237)', () => {
    const offsets = new Map([['s:column:1', { x: 10, y: -5 }]]);
    const k1 = { ...get('k1'), position: { x: 100, y: 200 } };
    expect(withDragOffset(k1, offsets).position).toEqual({ x: 110, y: 195 });
    expect(k1.position).toEqual({ x: 100, y: 200 });
    const prompt = get('prompt');
    expect(withDragOffset(prompt, offsets)).toBe(prompt);
  });
});
