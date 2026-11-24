import { describe, expect, it } from 'vitest';
import {
  agoraSearchQuery,
  agoraTabHref,
  agoraTabOfPath,
  isLiveFilterPath,
  legacyAgoraTabHref,
  matchesQuery,
  parseAgoraSearch,
} from './agora-search';

describe('agoraTabOfPath', () => {
  it.each([
    ['/agora', 'project'],
    ['/agora/', 'project'],
    ['/agora/projects/p-1', 'project'],
    ['/agora/creators', 'creator'],
    ['/agora/topics', 'topic'],
    ['/agora/topics/t-1', 'topic'],
    ['/', null],
    ['/projects/p-1', null],
    ['/agoras', null],
  ] as const)('%s → %s', (path, tab) => {
    expect(agoraTabOfPath(path)).toBe(tab);
  });
});

describe('isLiveFilterPath', () => {
  it('세 탭 화면과 핫토픽은 바로 거르고, 프로젝트 상세·아고라 밖은 아니다', () => {
    for (const path of ['/agora', '/agora/creators', '/agora/topics', '/agora/topics/t-1']) {
      expect(isLiveFilterPath(path), path).toBe(true);
    }
    for (const path of ['/agora/projects/p-1', '/', '/creators/c-1']) {
      expect(isLiveFilterPath(path), path).toBe(false);
    }
  });
});

describe('검색어 주소', () => {
  it('탭은 경로가, 검색어는 ?q= 가 정한다(앞뒤 공백 없음)', () => {
    expect(parseAgoraSearch('/agora/creators', new URLSearchParams('q=%20lind%20'))).toEqual({
      q: 'lind',
      scope: 'creator',
    });
    expect(parseAgoraSearch('/', new URLSearchParams())).toEqual({ q: '', scope: 'project' });
  });

  it('검색어가 비면 쿼리가 없고, 탭 주소는 검색어를 가져간다', () => {
    expect(agoraSearchQuery('   ')).toBe('');
    expect(agoraSearchQuery(' a b ')).toBe('?q=a+b');
    expect(agoraTabHref('topic', 'urban')).toBe('/agora/topics?q=urban');
    expect(agoraTabHref('project', '')).toBe('/agora');
  });

  it('예전 주소 ?in=creator|topic 은 그 탭 주소로, 그 밖은 null', () => {
    expect(legacyAgoraTabHref(new URLSearchParams('q=lind&in=creator'))).toBe(
      '/agora/creators?q=lind',
    );
    expect(legacyAgoraTabHref(new URLSearchParams('in=topic'))).toBe('/agora/topics');
    expect(legacyAgoraTabHref(new URLSearchParams('q=x&in=project'))).toBeNull();
    expect(legacyAgoraTabHref(new URLSearchParams('q=x'))).toBeNull();
  });

  it('matchesQuery 는 대소문자를 무시하고 빈 검색어는 모두 맞다', () => {
    expect(matchesQuery('Urban Trail', 'TRAIL')).toBe(true);
    expect(matchesQuery('Urban Trail', '  ')).toBe(true);
    expect(matchesQuery('Urban Trail', 'lamp')).toBe(false);
  });
});
