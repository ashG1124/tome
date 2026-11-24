import { describe, expect, it } from 'vitest';
import {
  mimeOfKey,
  rankCreators,
  rankNewCreators,
  rankProjects,
  scoreOf,
  utcDayRange,
} from './agora.rules';

const day = (n: number) => new Date(Date.UTC(2026, 10, n));

describe('scoreOf', () => {
  it('sums view, remix and derive counts and ignores likes; no row is 0', () => {
    expect(scoreOf({ viewCount: 3, remixCount: 2, deriveCount: 1 })).toBe(6);
    expect(scoreOf(null)).toBe(0);
    expect(scoreOf(undefined)).toBe(0);
  });
});

describe('rankProjects', () => {
  it('orders by score desc then latest postedAt', () => {
    const ranked = rankProjects([
      { id: 'a', score: 1, postedAt: day(1) },
      { id: 'b', score: 5, postedAt: day(1) },
      { id: 'c', score: 1, postedAt: day(3) },
    ]);
    expect(ranked.map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('rankCreators', () => {
  const c = (id: string, score: number, posted: number, seedOrder: number | null) => ({
    creatorId: id,
    score,
    latestPostedAt: day(posted),
    seedOrder,
  });

  it('orders by score sum, ties by latest postedAt', () => {
    const ranked = rankCreators([c('a', 2, 1, 1), c('b', 5, 1, 2), c('c', 2, 4, 3)]);
    expect(ranked.map((x) => x.creatorId)).toEqual(['b', 'c', 'a']);
  });

  it('uses seedOrder ascending (null last) when every score is 0', () => {
    const ranked = rankCreators([c('a', 0, 9, null), c('b', 0, 1, 2), c('c', 0, 5, 1)]);
    expect(ranked.map((x) => x.creatorId)).toEqual(['c', 'b', 'a']);
  });
});

describe('helpers', () => {
  it('utcDayRange covers one UTC day', () => {
    const { start, end } = utcDayRange(new Date('2026-11-17T23:59:59.999Z'));
    expect(start.toISOString()).toBe('2026-11-17T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-18T00:00:00.000Z');
  });

  it('mimeOfKey maps extensions and defaults to png', () => {
    expect(mimeOfKey('answers/x/full.jpg')).toBe('image/jpeg');
    expect(mimeOfKey('answers/x/full.png')).toBe('image/png');
    expect(mimeOfKey('weird')).toBe('image/png');
  });
});

describe('rankNewCreators', () => {
  const n = (id: string, posted: number) => ({ creatorId: id, firstPostedAt: day(posted) });

  it('orders by first public post, newest first', () => {
    const ranked = rankNewCreators([n('a', 1), n('b', 9), n('c', 4)]);
    expect(ranked.map((x) => x.creatorId)).toEqual(['b', 'c', 'a']);
  });

  it('breaks ties by id and keeps an empty list empty', () => {
    expect(rankNewCreators([n('b', 2), n('a', 2)]).map((x) => x.creatorId)).toEqual(['a', 'b']);
    expect(rankNewCreators([])).toEqual([]);
  });
});
