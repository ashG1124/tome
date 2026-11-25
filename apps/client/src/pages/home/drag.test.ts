import { describe, expect, it } from 'vitest';
import { cellAt, cellDelta, cellOrigin, DRAG_THRESHOLD, passedThreshold } from './drag';

/** Figma 서가 격자: 여백 20, 칸 108×192, 간격 20 → 가로 128·세로 212 간격 */
const GRID = { originX: 20, originY: 20, pitchX: 128, pitchY: 212 };

describe('passedThreshold', () => {
  it('기준 거리(6px) 이하면 클릭, 넘으면 끌기', () => {
    expect(DRAG_THRESHOLD).toBe(6);
    expect(passedThreshold(3, 4)).toBe(false); // 5px
    expect(passedThreshold(6, 0)).toBe(false);
    expect(passedThreshold(5, 5)).toBe(true); // 약 7.07px
  });
});

describe('cellOrigin·cellDelta', () => {
  it('칸 왼쪽 위와 두 칸 사이 거리', () => {
    expect(cellOrigin(GRID, { col: 2, row: 1 })).toEqual({ x: 276, y: 232 });
    expect(cellDelta(GRID, { col: 1, row: 0 }, { col: 3, row: 2 })).toEqual({ x: 256, y: 424 });
  });
});

describe('cellAt (#240 자유 배치: 가장 가까운 칸에 붙이기)', () => {
  it('카드 왼쪽 위에서 가장 가까운 칸을 고른다', () => {
    expect(cellAt(GRID, 276, 232, 13, 5)).toEqual({ col: 2, row: 1 });
    // 반 칸 못 미치면 앞 칸, 넘으면 다음 칸
    expect(cellAt(GRID, 276 + 63, 232 + 100, 13, 5)).toEqual({ col: 2, row: 1 });
    expect(cellAt(GRID, 276 + 65, 232 + 110, 13, 5)).toEqual({ col: 3, row: 2 });
  });

  it('서가 밖으로 끌면 가장자리 칸으로 자른다(오른쪽 끝 칸·아래 한도 줄)', () => {
    expect(cellAt(GRID, 5000, 232, 13, 5)).toEqual({ col: 12, row: 1 });
    expect(cellAt(GRID, -300, 5000, 13, 5)).toEqual({ col: 0, row: 5 });
    expect(cellAt(GRID, 276, -500, 13, 5)).toEqual({ col: 2, row: 0 });
  });

  it('+ Project 칸이거나 격자를 재지 못했으면 null', () => {
    expect(cellAt(GRID, 20, 20, 13, 5)).toBeNull();
    expect(cellAt({ ...GRID, pitchX: 0 }, 276, 232, 13, 5)).toBeNull();
  });
});
