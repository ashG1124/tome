import { describe, expect, it } from 'vitest';
import type { ProjectRow } from './projects.repository';
import { thumbAnswerId, toSummary } from './projects.service';

function row(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 'p1',
    ownerId: 'o1',
    kind: 'original',
    title: 'Title',
    status: 'building',
    finishedAt: null,
    postedAt: null,
    coverAnswerId: null,
    lastEditedAt: new Date('2026-01-02T03:04:05.000Z'),
    shelfPosition: 3,
    deletedAt: null,
    hiddenAt: null,
    remixPartner: null,
    sets: [],
    ...overrides,
  };
}

const at = (iso: string) => new Date(iso);

describe('thumbAnswerId (#211)', () => {
  it('대표 버전이 있으면 그것을 쓴다(완료 프로젝트)', () => {
    const sets = [
      {
        answers: [
          {
            id: 'new',
            acceptedAt: at('2026-02-01T00:00:00Z'),
            createdAt: at('2026-02-01T00:00:00Z'),
          },
        ],
      },
    ];
    expect(thumbAnswerId(row({ coverAnswerId: 'cover', sets }))).toBe('cover');
  });
  it('작업 중이면 세트들 중 가장 최근에 확정된 답변을 쓴다', () => {
    const sets = [
      {
        answers: [
          {
            id: 'old',
            acceptedAt: at('2026-01-01T00:00:00Z'),
            createdAt: at('2026-01-01T00:00:00Z'),
          },
        ],
      },
      { answers: [] },
      {
        answers: [
          {
            id: 'latest',
            acceptedAt: at('2026-03-01T00:00:00Z'),
            createdAt: at('2026-01-02T00:00:00Z'),
          },
        ],
      },
    ];
    expect(thumbAnswerId(row({ sets }))).toBe('latest');
    expect(toSummary(row({ sets })).coverThumbUrl).toBe('/assets/answers/latest/thumb');
  });
  it('확정된 답변이 없으면 null', () => {
    expect(thumbAnswerId(row({ sets: [{ answers: [] }] }))).toBeNull();
  });
});

describe('toSummary', () => {
  it('builds the cover thumb url only when there is a cover answer', () => {
    expect(toSummary(row()).coverThumbUrl).toBeNull();
    expect(toSummary(row({ coverAnswerId: 'a1' })).coverThumbUrl).toBe('/assets/answers/a1/thumb');
  });

  it('includes remixPartner only when present, with an avatar url only when it has an image', () => {
    const partner = { id: 'c1', kind: 'persona' as const, displayName: 'Mina', bio: null };
    expect(toSummary(row({ remixPartner: { ...partner, avatarKey: null } })).remixPartner).toEqual({
      ...partner,
      avatarUrl: null,
    });
    expect(
      toSummary(row({ remixPartner: { ...partner, avatarKey: 'avatars/c1.jpg' } })).remixPartner,
    ).toEqual({ ...partner, avatarUrl: '/assets/creators/c1/avatar' });
    expect('remixPartner' in toSummary(row())).toBe(false);
  });

  it('maps posted and lastEditedAt', () => {
    const summary = toSummary(row({ postedAt: new Date() }));
    expect(summary.posted).toBe(true);
    expect(summary.lastEditedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(toSummary(row()).posted).toBe(false);
  });
});
