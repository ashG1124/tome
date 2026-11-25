import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD, nearestSlot, passedThreshold, previewIndex, slotDelta } from './drag';

/** 한 줄 칸 4개(칸 108, 간격 20) */
const SLOTS = [0, 1, 2, 3].map((n) => ({ x: n * 128, y: 0, width: 108, height: 192 }));

describe('passedThreshold', () => {
  it('기준 거리(6px) 이하면 클릭, 넘으면 끌기', () => {
    expect(DRAG_THRESHOLD).toBe(6);
    expect(passedThreshold(3, 4)).toBe(false); // 5px
    expect(passedThreshold(6, 0)).toBe(false);
    expect(passedThreshold(5, 5)).toBe(true); // 약 7.07px
  });
});

describe('nearestSlot', () => {
  it('가운데가 가장 가까운 칸을 고르고, 칸이 없으면 -1', () => {
    expect(nearestSlot(SLOTS, 54, 96)).toBe(0);
    expect(nearestSlot(SLOTS, 54 + 128 * 2 + 40, 96)).toBe(2);
    expect(nearestSlot(SLOTS, 5000, 96)).toBe(3);
    expect(nearestSlot([], 0, 0)).toBe(-1);
  });
});

describe('previewIndex', () => {
  it('뒤로 끌면 사이 카드가 한 칸 앞으로, 앞으로 끌면 한 칸 뒤로 비켜 선다', () => {
    // 0 → 2
    expect([0, 1, 2, 3].map((i) => previewIndex(i, 0, 2))).toEqual([0, 0, 1, 3]);
    // 3 → 1
    expect([0, 1, 2, 3].map((i) => previewIndex(i, 3, 1))).toEqual([0, 2, 3, 3]);
    // 제자리
    expect([0, 1, 2, 3].map((i) => previewIndex(i, 1, 1))).toEqual([0, 1, 2, 3]);
  });
});

describe('slotDelta', () => {
  it('두 칸 사이 거리, 없는 칸이면 0', () => {
    expect(slotDelta(SLOTS, 0, 2)).toEqual({ x: 256, y: 0 });
    expect(slotDelta(SLOTS, 3, 1)).toEqual({ x: -256, y: 0 });
    expect(slotDelta(SLOTS, 0, 9)).toEqual({ x: 0, y: 0 });
  });
});
