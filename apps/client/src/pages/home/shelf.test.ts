import type { ProjectSummary } from '@tome/shared';
import { describe, expect, it } from 'vitest';
import {
  applyOrder,
  formatEditedDate,
  moveCard,
  shelfCardType,
  shelfTags,
  sortShelf,
} from './shelf';

function project(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: '0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c',
    title: 'Neon street at night',
    status: 'building',
    posted: false,
    coverThumbUrl: null,
    lastEditedAt: '2026-11-03T10:30:00.000Z',
    shelfPosition: 0,
    kind: 'original',
    ...overrides,
  };
}

describe('sortShelf', () => {
  it('shelfPosition 이 작은 것부터 늘어놓고 원본은 그대로 둔다', () => {
    const list = [
      project({ title: 'c', shelfPosition: 2 }),
      project({ title: 'a', shelfPosition: 0 }),
      project({ title: 'b', shelfPosition: 1 }),
    ];

    expect(sortShelf(list).map((p) => p.title)).toEqual(['a', 'b', 'c']);
    expect(list.map((p) => p.title)).toEqual(['c', 'a', 'b']);
  });
});

describe('shelfCardType', () => {
  it('파생작은 derive', () => {
    expect(shelfCardType(project({ kind: 'derive' }))).toBe('derive');
  });

  it('리믹스 상대가 있으면 remix', () => {
    const partner = {
      id: '7d2a9e44-6b3f-4c10-b5d8-9e0f1a2b3c4d',
      kind: 'persona' as const,
      displayName: 'Visitor 1',
      bio: null,
      avatarUrl: null,
    };
    expect(shelfCardType(project({ remixPartner: partner }))).toBe('remix');
  });

  it('그 밖에는 my-work', () => {
    expect(shelfCardType(project())).toBe('my-work');
  });
});

describe('shelfTags', () => {
  it('완료하고 게시했으면 finished 와 posted 둘 다', () => {
    expect(shelfTags(project({ status: 'finished', posted: true }))).toEqual([
      'finished',
      'posted',
    ]);
  });

  it('완료만 했으면 finished', () => {
    expect(shelfTags(project({ status: 'finished', posted: false }))).toEqual(['finished']);
  });

  it('만드는 중이면 태그 없음', () => {
    expect(shelfTags(project())).toEqual([]);
  });
});

describe('formatEditedDate', () => {
  it('상대 표기 없이 절대 날짜로 보여 준다', () => {
    expect(formatEditedDate('2026-11-03T10:30:00.000Z', 'en-US', 'UTC')).toBe('Nov 3, 2026');
  });

  it('로케일을 따른다', () => {
    expect(formatEditedDate('2026-11-03T10:30:00.000Z', 'ko-KR', 'UTC')).toBe('2026. 11. 3.');
  });
});

describe('moveCard', () => {
  const list = ['a', 'b', 'c', 'd'];

  it('뒤로 옮긴다', () => {
    expect(moveCard(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('앞으로 옮긴다', () => {
    expect(moveCard(list, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('같은 칸이거나 범위를 벗어나면 그대로 둔다', () => {
    expect(moveCard(list, 1, 1)).toEqual(list);
    expect(moveCard(list, 1, 4)).toEqual(list);
    expect(moveCard(list, 5, 0)).toEqual(list);
  });

  it('원본 배열은 바꾸지 않는다', () => {
    moveCard(list, 0, 3);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('applyOrder', () => {
  const a = project({ id: '0b8c1f5e-3c1d-4f6a-8a9b-1d2e3f4a5b6c', title: 'a' });
  const b = project({ id: '7d2a9e44-6b3f-4c10-b5d8-9e0f1a2b3c4d', title: 'b' });
  const c = project({ id: 'c4a1e7d2-8b5f-4e39-a6c0-2f1d3b4a5c6e', title: 'c' });

  it('바꾼 순서가 없으면 받은 순서 그대로', () => {
    expect(applyOrder([a, b, c], null).map((p) => p.title)).toEqual(['a', 'b', 'c']);
  });

  it('바꾼 순서(id 목록)대로 늘어놓는다', () => {
    expect(applyOrder([a, b, c], [c.id, a.id, b.id]).map((p) => p.title)).toEqual(['c', 'a', 'b']);
  });

  it('순서에 없는 새 프로젝트는 맨 앞에, 사라진 프로젝트는 빼고 놓는다', () => {
    expect(applyOrder([a, c], [b.id, a.id]).map((p) => p.title)).toEqual(['c', 'a']);
  });
});
