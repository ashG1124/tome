import { LIMITS, type WorkspaceResponse } from '@tome/shared';
import { describe, expect, it } from 'vitest';
import { pageIdFromSearch, pageMenu } from './pageMenu';

const PAGE_IDS = Array.from(
  { length: LIMITS.PAGES_MAX },
  (_, i) => `c4a1e7d2-8b5f-4e39-a6c0-2f1d3b4a5c${String(i).padStart(2, '0')}`,
);

function pages(count: number): WorkspaceResponse['pages'] {
  return PAGE_IDS.slice(0, count).map((id, index) => ({ id, index, setCount: 0 }));
}

describe('pageMenu', () => {
  it('페이지가 하나면 "Page 1" 하나와 지금 페이지 표시, + 는 켜져 있다', () => {
    expect(pageMenu({ pages: pages(1), currentPageId: PAGE_IDS[0] ?? '' })).toEqual({
      count: 1,
      currentNumber: 1,
      items: [{ id: PAGE_IDS[0], number: 1, current: true }],
      canAdd: true,
    });
  });

  it('서버가 준 순서와 상관없이 index 순서로 정렬하고 번호는 index + 1', () => {
    const shuffled = [...pages(3)].reverse();
    const menu = pageMenu({ pages: shuffled, currentPageId: PAGE_IDS[1] ?? '' });

    expect(menu.items.map((item) => item.number)).toEqual([1, 2, 3]);
    expect(menu.items.map((item) => item.current)).toEqual([false, true, false]);
    expect(menu.currentNumber).toBe(2);
    expect(menu.count).toBe(3);
  });

  it('페이지가 상한(10개)이면 + 를 끈다', () => {
    expect(pageMenu({ pages: pages(LIMITS.PAGES_MAX - 1), currentPageId: '' }).canAdd).toBe(true);
    expect(pageMenu({ pages: pages(LIMITS.PAGES_MAX), currentPageId: '' }).canAdd).toBe(false);
  });

  it('지금 페이지를 목록에서 찾지 못하면 번호는 1로 둔다', () => {
    const menu = pageMenu({ pages: pages(2), currentPageId: 'missing' });
    expect(menu.currentNumber).toBe(1);
    expect(menu.items.every((item) => !item.current)).toBe(true);
  });
});

describe('pageIdFromSearch', () => {
  it('?page= 값을 돌려주고, 없거나 비어 있으면 undefined', () => {
    expect(pageIdFromSearch(new URLSearchParams(`page=${PAGE_IDS[2]}`))).toBe(PAGE_IDS[2]);
    expect(pageIdFromSearch(new URLSearchParams(''))).toBeUndefined();
    expect(pageIdFromSearch(new URLSearchParams('page='))).toBeUndefined();
  });
});
