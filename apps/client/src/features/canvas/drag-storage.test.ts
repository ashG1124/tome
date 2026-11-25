import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DRAG_PAGES_MAX,
  DRAG_STORAGE_PREFIX,
  DRAG_UNITS_MAX,
  dragStorageKey,
  dragUnitSet,
  parseDragOffsets,
  readDragOffsets,
  serializeDragOffsets,
  writeDragOffsets,
} from './drag-storage';

const SET = '0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c';
const OTHER = '6f1e2d3c-4b5a-4968-8778-695a4b3c2d1e';
const KEY = dragStorageKey('project', 'page');

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('drag position storage (#237)', () => {
  it('keys by project and page', () => {
    expect(dragStorageKey('p1', 'g1')).toBe(`${DRAG_STORAGE_PREFIX}p1.g1`);
    expect(dragStorageKey('p1', 'g1')).not.toBe(dragStorageKey('p1', 'g2'));
  });

  it('only accepts the unit ids the canvas makes', () => {
    for (const unit of [
      `${SET}:prompt`,
      `${SET}:origin`,
      `${SET}:answer`,
      `${SET}:column:1`,
      `${SET}:column:5`,
      `${SET}:group:analyze-0`,
      `${SET}:group:verify-12`,
    ])
      expect(dragUnitSet(unit)).toBe(SET);
    for (const unit of [
      `${SET}:column:6`,
      `${SET}:group:other-1`,
      `${SET}:unknown`,
      'prompt',
      `${SET}:prompt:extra`,
      `bad id:prompt`,
    ])
      expect(dragUnitSet(unit)).toBeUndefined();
  });

  it('round-trips offsets through a versioned value', () => {
    const offsets = new Map([
      [`${SET}:column:2`, { x: 12.5, y: -40 }],
      [`${SET}:answer`, { x: 0, y: 30 }],
    ]);
    const raw = serializeDragOffsets(offsets, undefined, 123)!;
    expect(JSON.parse(raw)).toEqual({
      v: 1,
      savedAt: 123,
      offsets: { [`${SET}:column:2`]: [12.5, -40], [`${SET}:answer`]: [0, 30] },
    });
    expect(parseDragOffsets(raw)).toEqual(offsets);
  });

  it('drops units of sets that are gone, zero moves, and returns nothing when empty', () => {
    const offsets = new Map([
      [`${SET}:prompt`, { x: 5, y: 5 }],
      [`${OTHER}:prompt`, { x: 5, y: 5 }],
      [`${SET}:answer`, { x: 0, y: 0 }],
    ]);
    const kept = parseDragOffsets(serializeDragOffsets(offsets, new Set([SET]))!);
    expect([...kept.keys()]).toEqual([`${SET}:prompt`]);
    expect(serializeDragOffsets(new Map([[`${SET}:answer`, { x: 0, y: 0 }]]))).toBeUndefined();
  });

  it('keeps only the most recent units when there are too many', () => {
    const offsets = new Map(
      Array.from({ length: DRAG_UNITS_MAX + 5 }, (_, index) => [
        `${SET}:group:draft-${index}`,
        { x: index + 1, y: 0 },
      ]),
    );
    const kept = parseDragOffsets(serializeDragOffsets(offsets)!);
    expect(kept.size).toBe(DRAG_UNITS_MAX);
    expect(kept.has(`${SET}:group:draft-0`)).toBe(false);
    expect(kept.get(`${SET}:group:draft-${DRAG_UNITS_MAX + 4}`)).toEqual({
      x: DRAG_UNITS_MAX + 5,
      y: 0,
    });
  });

  it('ignores broken, old-version, and odd values', () => {
    expect(parseDragOffsets(null).size).toBe(0);
    expect(parseDragOffsets('not json').size).toBe(0);
    expect(parseDragOffsets('null').size).toBe(0);
    expect(parseDragOffsets('[]').size).toBe(0);
    expect(parseDragOffsets(JSON.stringify({ v: 2, offsets: {} })).size).toBe(0);
    expect(parseDragOffsets(JSON.stringify({ v: 1, offsets: [] })).size).toBe(0);
    const mixed = parseDragOffsets(
      JSON.stringify({
        v: 1,
        savedAt: 1,
        offsets: {
          [`${SET}:prompt`]: [1, 2],
          [`${SET}:mystery`]: [1, 2],
          [`${SET}:answer`]: ['1', 2],
          [`${SET}:origin`]: [1],
          [`${SET}:column:1`]: [1e9, 0],
          [`${SET}:column:2`]: { x: 1, y: 2 },
          ['__proto__']: [1, 2],
        },
      }),
    );
    expect([...mixed]).toEqual([[`${SET}:prompt`, { x: 1, y: 2 }]]);
  });

  it('reads back what it wrote, and removes the entry when nothing is moved', () => {
    writeDragOffsets(KEY, new Map([[`${SET}:prompt`, { x: 3, y: 4 }]]));
    expect(readDragOffsets(KEY)).toEqual(new Map([[`${SET}:prompt`, { x: 3, y: 4 }]]));
    writeDragOffsets(KEY, new Map());
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readDragOffsets(KEY).size).toBe(0);
  });

  it('forgets the oldest pages when too many are stored', () => {
    for (let index = 0; index < DRAG_PAGES_MAX + 3; index += 1) {
      vi.spyOn(Date, 'now').mockReturnValue(1000 + index);
      writeDragOffsets(
        dragStorageKey('p', `g${index}`),
        new Map([[`${SET}:prompt`, { x: 1, y: 1 }]]),
      );
    }
    const kept = Object.keys(localStorage).filter((key) => key.startsWith(DRAG_STORAGE_PREFIX));
    expect(kept).toHaveLength(DRAG_PAGES_MAX);
    expect(kept).not.toContain(dragStorageKey('p', 'g0'));
    expect(kept).toContain(dragStorageKey('p', `g${DRAG_PAGES_MAX + 2}`));
    // 다른 앱 값은 건드리지 않는다.
    localStorage.setItem('tome.token', 'x');
    writeDragOffsets(dragStorageKey('p', 'new'), new Map([[`${SET}:prompt`, { x: 1, y: 1 }]]));
    expect(localStorage.getItem('tome.token')).toBe('x');
  });

  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(readDragOffsets(KEY).size).toBe(0);
    expect(() => writeDragOffsets(KEY, new Map([[`${SET}:prompt`, { x: 1, y: 1 }]]))).not.toThrow();
  });
});
