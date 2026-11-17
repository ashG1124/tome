import { describe, expect, it } from 'vitest';
import { LIMITS } from './common.js';
import { CreatePageResponseSchema, PageSchema, PageWithCountSchema } from './page.js';
import { ID_A } from './testing/fixtures.js';

describe('page schemas', () => {
  it('accepts index 0 and the last index', () => {
    expect(PageSchema.safeParse({ id: ID_A, index: 0 }).success).toBe(true);
    expect(PageSchema.safeParse({ id: ID_A, index: LIMITS.PAGES_MAX - 1 }).success).toBe(true);
  });

  it('rejects index at the page limit or below zero', () => {
    expect(PageSchema.safeParse({ id: ID_A, index: LIMITS.PAGES_MAX }).success).toBe(false);
    expect(PageSchema.safeParse({ id: ID_A, index: -1 }).success).toBe(false);
  });

  it('caps setCount at the sets-per-page limit', () => {
    const page = { id: ID_A, index: 0 };
    const count = (setCount: number) =>
      PageWithCountSchema.safeParse({ ...page, setCount }).success;
    expect(count(LIMITS.SETS_PER_PAGE)).toBe(true);
    expect(count(LIMITS.SETS_PER_PAGE + 1)).toBe(false);
  });

  it('parses the create-page response', () => {
    expect(CreatePageResponseSchema.safeParse({ page: { id: ID_A, index: 1 } }).success).toBe(true);
  });
});
