import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampCell,
  lastRow,
  LAYOUT_ENTRIES_MAX,
  layoutStorageKey,
  parseLayout,
  placeCard,
  planShelfWrites,
  pushShifts,
  readingOrder,
  readLayout,
  resolveLayout,
  serializeLayout,
  stepCell,
  writeLayout,
  type Cell,
} from './freeLayout';
import { placeAt } from './shelf';

const cell = (col: number, row: number): Cell => ({ col, row });
const asObject = (cells: ReadonlyMap<string, Cell>) =>
  Object.fromEntries([...cells].map(([id, at]) => [id, [at.col, at.row]]));

describe('resolveLayout', () => {
  it('저장한 자리가 없으면 서가 순서대로 + Project 다음 칸부터 채운다', () => {
    const cells = resolveLayout(['a', 'b', 'c'], new Map(), 2);
    expect(asObject(cells)).toEqual({ a: [1, 0], b: [0, 1], c: [1, 1] });
  });

  it('저장한 칸에 놓고, 새 카드는 맨 위 첫 빈 칸에 놓는다', () => {
    const saved = new Map([
      ['a', cell(5, 2)],
      ['b', cell(1, 0)],
    ]);
    const cells = resolveLayout(['n', 'a', 'b'], saved, 13);
    expect(asObject(cells)).toEqual({ n: [2, 0], a: [5, 2], b: [1, 0] });
  });

  it('줄 칸 수가 줄면 넘친 카드를 그 줄 끝으로 당기고, 찼으면 다음 빈 칸으로 보낸다', () => {
    const saved = new Map([
      ['a', cell(12, 0)],
      ['b', cell(10, 0)],
      ['c', cell(11, 0)],
    ]);
    const narrow = resolveLayout(['a', 'b', 'c'], saved, 11);
    // b 는 제자리(10), a·c 는 끝 칸(10)으로 당기려다 찼으니 다음 줄 첫 빈 칸으로
    expect(asObject(narrow)).toEqual({ b: [10, 0], a: [0, 1], c: [1, 1] });
    // 저장한 자리는 그대로라 다시 넓히면 원래 칸으로 돌아온다
    expect(asObject(resolveLayout(['a', 'b', 'c'], saved, 13))).toEqual({
      a: [12, 0],
      b: [10, 0],
      c: [11, 0],
    });
  });

  it('저장한 자리에 모르는 id 가 있어도 무시한다', () => {
    const cells = resolveLayout(['a'], new Map([['gone', cell(1, 0)]]), 13);
    expect(asObject(cells)).toEqual({ a: [1, 0] });
  });
});

describe('placeCard', () => {
  const cells = new Map([
    ['a', cell(1, 0)],
    ['b', cell(2, 0)],
  ]);

  it('빈 칸이면 그 칸으로 옮긴다', () => {
    expect(asObject(placeCard(cells, 'a', cell(4, 3)))).toEqual({ a: [4, 3], b: [2, 0] });
  });

  it('다른 카드가 있는 칸이면 둘의 자리를 맞바꾼다', () => {
    expect(asObject(placeCard(cells, 'a', cell(2, 0)))).toEqual({ a: [2, 0], b: [1, 0] });
  });

  it('같은 칸·+ Project 칸·모르는 카드면 그대로', () => {
    expect(placeCard(cells, 'a', cell(1, 0))).toBe(cells);
    expect(placeCard(cells, 'a', cell(0, 0))).toBe(cells);
    expect(placeCard(cells, 'zzz', cell(5, 5))).toBe(cells);
  });
});

describe('readingOrder·lastRow', () => {
  it('위 줄 먼저, 같은 줄은 왼쪽 먼저', () => {
    const cells = new Map([
      ['a', cell(3, 1)],
      ['b', cell(7, 0)],
      ['c', cell(0, 1)],
    ]);
    expect(readingOrder(cells)).toEqual(['b', 'c', 'a']);
    expect(lastRow(cells)).toBe(1);
    expect(lastRow(new Map())).toBe(0);
  });
});

describe('stepCell·clampCell', () => {
  it('한 칸 옆으로, 서가 밖·+ Project 칸이면 null', () => {
    expect(stepCell(cell(2, 1), 'left', 13, 3)).toEqual(cell(1, 1));
    expect(stepCell(cell(2, 1), 'down', 13, 3)).toEqual(cell(2, 2));
    expect(stepCell(cell(1, 0), 'left', 13, 3)).toBeNull();
    expect(stepCell(cell(0, 1), 'up', 13, 3)).toBeNull();
    expect(stepCell(cell(12, 1), 'right', 13, 3)).toBeNull();
    expect(stepCell(cell(4, 0), 'up', 13, 3)).toBeNull();
    expect(stepCell(cell(4, 3), 'down', 13, 3)).toBeNull();
  });

  it('범위 안으로 자르고 반올림한다', () => {
    expect(clampCell(cell(20, -2), 13, 4)).toEqual(cell(12, 0));
    expect(clampCell(cell(2.6, 9), 13, 4)).toEqual(cell(3, 4));
    expect(clampCell(cell(0.2, 0.3), 13, 4)).toBeNull();
  });
});

describe('pushShifts (hover 로 넓어진 카드 옆 밀기, Figma Home_hover)', () => {
  // Figma 첫 줄: 카드가 1·2·3·6 칸에 있고 1 칸 카드가 넓어진다
  const cells = new Map([
    ['open', cell(1, 0)],
    ['red', cell(2, 0)],
    ['white', cell(3, 0)],
    ['speaker', cell(6, 0)],
    ['below', cell(2, 1)],
  ]);

  it('붙어 있는 뒤 카드만 넓은 카드 끝 다음 칸으로 밀고, 빈 칸에서 멈춘다', () => {
    const shifts = pushShifts(cells, 'open', 3, false);
    expect(Object.fromEntries(shifts)).toEqual({ red: 2, white: 2 });
  });

  it('왼쪽으로 넓어지거나 아무것도 안 열렸으면 밀지 않는다', () => {
    expect(pushShifts(cells, 'open', 3, true).size).toBe(0);
    expect(pushShifts(cells, null, 3, false).size).toBe(0);
  });

  it('밀린 카드가 다음 카드를 이어서 민다', () => {
    const row = new Map([
      ['open', cell(1, 0)],
      ['x', cell(4, 0)],
      ['y', cell(5, 0)],
      ['z', cell(3, 0)],
    ]);
    expect(Object.fromEntries(pushShifts(row, 'open', 3, false))).toEqual({ z: 1, x: 1, y: 1 });
  });
});

describe('orderMoves (서버 서가 순서 맞추기)', () => {
  function apply(full: string[], visible: string[], next: string[], prefer?: string) {
    const { order, writes } = planShelfWrites(full, visible, next, prefer);
    // 서버(planShelfOrder = placeAt)에 차례대로 보낸 결과도 같은 순서가 된다
    let server = full;
    for (const [id, position] of writes) server = placeAt(server, id, position);
    expect(server).toEqual(order);
    return { order, moves: writes.map(([id]) => id) };
  }

  it('맞바꾸면 두 카드만, 한 카드를 옮기면 그 카드만 저장한다', () => {
    expect(apply(['a', 'b', 'c'], ['a', 'b', 'c'], ['b', 'a', 'c'], 'a')).toEqual({
      order: ['b', 'a', 'c'],
      moves: ['a'],
    });
    const swap = apply(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'], ['d', 'b', 'c', 'a'], 'a');
    expect(swap.order).toEqual(['d', 'b', 'c', 'a']);
    expect(swap.moves).toHaveLength(2);
    expect(apply(['a', 'b'], ['a', 'b'], ['a', 'b']).moves).toEqual([]);
  });

  it('숨긴 빈 프로젝트가 섞여 있어도 보이는 카드는 next 순서가 된다', () => {
    const permutations = [
      ['c', 'a', 'd', 'b'],
      ['d', 'c', 'b', 'a'],
      ['b', 'd', 'a', 'c'],
      ['d', 'a', 'b', 'c'],
      ['b', 'c', 'd', 'a'],
      ['a', 'b', 'c', 'd'],
    ];
    for (const next of permutations) {
      const { order } = apply(['a', 'h1', 'b', 'c', 'h2', 'd'], ['a', 'b', 'c', 'd'], next);
      expect(order.filter((id) => !id.startsWith('h'))).toEqual(next);
      expect(order).toHaveLength(6);
    }
  });
});

describe('저장(localStorage)', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('만든 사람별 키에 버전과 함께 쓰고 다시 읽는다. 모르는 id 는 빼고 쓴다', () => {
    const cells = new Map([
      ['a1', cell(3, 2)],
      ['gone', cell(4, 4)],
    ]);
    writeLayout('creator-1', cells, new Set(['a1']));
    const raw = localStorage.getItem(layoutStorageKey('creator-1'));
    expect(JSON.parse(raw ?? '{}')).toEqual({ v: 1, cells: { a1: [3, 2] } });
    expect(asObject(readLayout('creator-1'))).toEqual({ a1: [3, 2] });
    expect(readLayout('creator-2').size).toBe(0);
    expect(readLayout(null).size).toBe(0);
  });

  it('버전·모양이 다르거나 이상한 값·겹친 칸·+ Project 칸은 버린다', () => {
    expect(parseLayout(null).size).toBe(0);
    expect(parseLayout('not json').size).toBe(0);
    expect(parseLayout(JSON.stringify({ v: 2, cells: { a: [1, 1] } })).size).toBe(0);
    expect(parseLayout(JSON.stringify({ v: 1, cells: [] })).size).toBe(0);
    const parsed = parseLayout(
      JSON.stringify({
        v: 1,
        cells: {
          ok: [2, 3],
          same: [2, 3],
          home: [0, 0],
          minus: [-1, 2],
          float: [1.5, 2],
          far: [1, 999],
          text: ['1', '2'],
          'bad id!': [4, 4],
        },
      }),
    );
    expect(asObject(parsed)).toEqual({ ok: [2, 3] });
  });

  it('개수 상한을 넘으면 앞의 것만 남긴다', () => {
    const many = new Map(
      Array.from({ length: LAYOUT_ENTRIES_MAX + 20 }, (_, n) => [
        `p${n}`,
        cell(1 + (n % 60), n % 60),
      ]),
    );
    const parsed = parseLayout(serializeLayout(many));
    expect(parsed.size).toBeLessThanOrEqual(LAYOUT_ENTRIES_MAX);
  });

  it('저장소를 못 쓰면 조용히 넘어간다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => writeLayout('c', new Map([['a', cell(1, 0)]]))).not.toThrow();
    expect(readLayout('c').size).toBe(0);
  });
});
