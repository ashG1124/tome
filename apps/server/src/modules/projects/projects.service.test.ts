import { describe, expect, it } from 'vitest';
import type { ProjectRow } from './projects.repository';
import { toSummary } from './projects.service';

function row(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 'p1',
    ownerId: 'o1',
    kind: 'original',
    title: 'Title',
    status: 'building',
    postedAt: null,
    coverAnswerId: null,
    lastEditedAt: new Date('2026-01-02T03:04:05.000Z'),
    shelfPosition: 3,
    deletedAt: null,
    hiddenAt: null,
    remixPartner: null,
    ...overrides,
  };
}

describe('toSummary', () => {
  it('builds the cover thumb url only when there is a cover answer', () => {
    expect(toSummary(row()).coverThumbUrl).toBeNull();
    expect(toSummary(row({ coverAnswerId: 'a1' })).coverThumbUrl).toBe('/assets/answers/a1/thumb');
  });

  it('includes remixPartner with a null avatar only when present', () => {
    const partner = { id: 'c1', kind: 'persona' as const, displayName: 'Mina', bio: null };
    expect(toSummary(row({ remixPartner: partner })).remixPartner).toEqual({
      ...partner,
      avatarUrl: null,
    });
    expect('remixPartner' in toSummary(row())).toBe(false);
  });

  it('maps posted and lastEditedAt', () => {
    const summary = toSummary(row({ postedAt: new Date() }));
    expect(summary.posted).toBe(true);
    expect(summary.lastEditedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(toSummary(row()).posted).toBe(false);
  });
});
