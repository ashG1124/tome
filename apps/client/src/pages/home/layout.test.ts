import { describe, expect, it } from 'vitest';
import { columnsFor, opensToLeft } from './layout';

describe('columnsFor', () => {
  it('칸 폭과 간격으로 한 줄의 칸 수를 센다', () => {
    expect(columnsFor(1680, 108, 20)).toBe(13);
    expect(columnsFor(1679, 108, 20)).toBe(13);
    expect(columnsFor(236, 108, 20)).toBe(2);
  });

  it('너무 좁거나 아직 재지 못했으면 1칸', () => {
    expect(columnsFor(0, 108, 20)).toBe(1);
    expect(columnsFor(50, 108, 20)).toBe(1);
  });
});

describe('opensToLeft', () => {
  it('넓어질 자리가 오른쪽에 있으면 오른쪽으로', () => {
    expect(opensToLeft(1, 13)).toBe(false);
    expect(opensToLeft(10, 13)).toBe(false);
  });

  it('오른쪽 끝 두 칸이면 왼쪽으로, 다음 줄 첫 칸은 다시 오른쪽으로', () => {
    expect(opensToLeft(11, 13)).toBe(true);
    expect(opensToLeft(12, 13)).toBe(true);
    expect(opensToLeft(13, 13)).toBe(false);
  });

  it('한 줄이 넓어진 카드보다 좁으면 그대로 둔다', () => {
    expect(opensToLeft(2, 3)).toBe(false);
  });
});
