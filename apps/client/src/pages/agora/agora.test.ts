import type {
  AgoraComment,
  AgoraHomeResponse,
  AgoraProjectCard,
  CreatorSummary,
  TopicResponse,
} from '@tome/shared';
import { describe, expect, it } from 'vitest';
import { ApiRequestError, NetworkError } from '../../shared/api';
import {
  canDeleteComment,
  checkCommentBody,
  deriveFailure,
  derivedFromView,
  formatCommentDate,
  filterAgoraHome,
  filterCreators,
  filterTopicEntries,
  filterTopicProjects,
  formatCount,
  isAgoraEmpty,
  isCreatorsEmpty,
  isTopicEmpty,
  TOPIC_TILE_COUNT,
  topicExtraCount,
  topicTiles,
} from './agora';

const AUTHOR: CreatorSummary = {
  id: '5b1d6c0e-2f43-4a8e-9c1b-7a3e5d2f8b11',
  kind: 'seed',
  displayName: 'Judy',
  bio: null,
  avatarUrl: null,
};

function card(n: number, cover: string | null = `/assets/answers/a${n}/thumb`): AgoraProjectCard {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    title: `Project ${n}`,
    kind: 'original',
    author: AUTHOR,
    coverThumbUrl: cover,
    likeCount: 0,
    commentCount: 0,
  };
}

function comment(mine: boolean): AgoraComment {
  return {
    id: '7d2a9e44-6b3f-4c10-b5d8-9e0f1a2b3c4d',
    author: AUTHOR,
    body: 'Nice work',
    createdAt: '2026-11-03T10:30:00.000Z',
    mine,
  };
}

function apiError(code: ApiRequestError['code'], status: number, retryable: boolean) {
  return new ApiRequestError(status, { code, message: code, retryable });
}

describe('formatCount', () => {
  it('1000 미만은 숫자 그대로 보여 준다', () => {
    expect([0, 42, 999].map(formatCount)).toEqual(['0', '42', '999']);
  });

  it('1000 이상은 k, 100만 이상은 m 으로 줄이고 소수 첫째 자리 아래는 버린다', () => {
    expect([1000, 1250, 10_500, 999_999].map(formatCount)).toEqual([
      '1k',
      '1.2k',
      '10.5k',
      '999.9k',
    ]);
    expect([1_000_000, 1_250_000].map(formatCount)).toEqual(['1m', '1.2m']);
  });

  it('음수나 소수가 와도 0 이상의 정수로 다룬다', () => {
    expect([-5, 41.9].map(formatCount)).toEqual(['0', '41']);
  });
});

describe('topicTiles', () => {
  it('앞의 4개 표지만 보여 준다', () => {
    const tiles = topicTiles([1, 2, 3, 4, 5, 6].map((n) => card(n)));
    expect(tiles.covers).toHaveLength(TOPIC_TILE_COUNT);
    expect(tiles.covers[0]).toBe('/assets/answers/a1/thumb');
  });

  it('4개보다 적으면 있는 만큼만, 표지 없는 프로젝트는 빈 칸(null)으로 둔다', () => {
    const tiles = topicTiles([card(1), card(2, null), card(3)]);
    expect(tiles.covers).toEqual(['/assets/answers/a1/thumb', null, '/assets/answers/a3/thumb']);
  });
});

describe('derivedFromView', () => {
  it('파생작이 아니면 출처를 보여 주지 않는다', () => {
    expect(derivedFromView(undefined)).toBeNull();
  });

  it('원작 제목이 있으면 그 원작으로 이어 준다', () => {
    const view = derivedFromView({
      projectId: card(1).id,
      answerId: null,
      title: 'Urban Trail',
    });
    expect(view).toEqual({ kind: 'source', projectId: card(1).id, title: 'Urban Trail' });
  });

  it('원작이 지워져 제목이 없으면 Deleted original 로 둔다', () => {
    expect(derivedFromView({ projectId: card(1).id, answerId: null, title: null })).toEqual({
      kind: 'deleted',
    });
  });
});

describe('댓글', () => {
  it('앞뒤 공백을 빼고 1~300자일 때만 보낸다', () => {
    expect(checkCommentBody('  Nice work  ')).toEqual({ ok: true, body: 'Nice work' });
    expect(checkCommentBody('a'.repeat(300))).toEqual({ ok: true, body: 'a'.repeat(300) });
    expect(checkCommentBody('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(checkCommentBody('a'.repeat(301))).toEqual({ ok: false, reason: 'too-long' });
  });

  it('내 댓글만 지울 수 있다', () => {
    expect(canDeleteComment(comment(true))).toBe(true);
    expect(canDeleteComment(comment(false))).toBe(false);
  });

  it('댓글 시각은 상대 표기 없이 기기 로케일의 절대 날짜다', () => {
    expect(formatCommentDate('2026-11-03T10:30:00.000Z', 'en-US', 'UTC')).toBe('Nov 3, 2026');
    expect(formatCommentDate('2026-11-03T10:30:00.000Z', 'ko-KR', 'UTC')).toBe('2026. 11. 3.');
  });
});

describe('deriveFailure', () => {
  it('원작이 지워졌거나 숨겨져 복사할 수 없으면 Deleted original 이고 다시 시도하지 않는다', () => {
    expect(deriveFailure(apiError('DERIVE_SOURCE_UNAVAILABLE', 409, false))).toEqual({
      copy: 'S-06',
      retry: false,
    });
    expect(deriveFailure(apiError('NOT_FOUND', 404, false))).toEqual({
      copy: 'S-06',
      retry: false,
    });
  });

  it('연결이 끊기면 E-03 이고 다시 시도할 수 있다', () => {
    expect(deriveFailure(new NetworkError())).toEqual({ copy: 'E-03', retry: true });
  });

  it('그 밖의 오류는 공통 문구를 쓰고, 서버가 다시 시도해도 된다고 한 경우만 Retry 를 둔다', () => {
    expect(deriveFailure(apiError('AI_UNAVAILABLE', 503, true))).toEqual({
      copy: 'E-01a',
      retry: true,
    });
    expect(deriveFailure(apiError('RATE_LIMITED', 429, true))).toEqual({
      copy: 'G2',
      retry: true,
    });
    expect(deriveFailure(new Error('boom'))).toEqual({ copy: 'E-01a', retry: false });
  });
});

describe('빈 상태', () => {
  const emptyHome: AgoraHomeResponse = {
    recommended: [],
    risingCreators: [],
    newCreators: [],
    hotTopics: [],
  };

  it('게시된 프로젝트가 하나도 없으면 아고라가 빈 것으로 본다(크리에이터만 있어도)', () => {
    expect(isAgoraEmpty(emptyHome)).toBe(true);
    expect(isAgoraEmpty({ ...emptyHome, risingCreators: [AUTHOR] })).toBe(true);
    expect(
      isAgoraEmpty({
        ...emptyHome,
        hotTopics: [
          { topic: { id: card(9).id, title: 'Urban Trail' }, projects: [], projectCount: 0 },
        ],
      }),
    ).toBe(true);
  });

  it('추천이나 핫토픽에 프로젝트가 하나라도 있으면 비어 있지 않다', () => {
    expect(isAgoraEmpty({ ...emptyHome, recommended: [card(1)] })).toBe(false);
    expect(
      isAgoraEmpty({
        ...emptyHome,
        hotTopics: [
          {
            topic: { id: card(9).id, title: 'Urban Trail' },
            projects: [card(1)],
            projectCount: 1,
          },
        ],
      }),
    ).toBe(false);
  });

  it('핫토픽에 프로젝트가 없으면 목록 대신 빈 안내를 보여 준다', () => {
    const topic: TopicResponse = { topic: { id: card(9).id, title: 'Urban Trail' }, projects: [] };
    expect(isTopicEmpty(topic)).toBe(true);
    expect(isTopicEmpty({ ...topic, projects: [card(1)] })).toBe(false);
  });
});

describe('탭별 검색(#214)', () => {
  const lind: CreatorSummary = {
    ...AUTHOR,
    id: `${AUTHOR.id.slice(0, -2)}21`,
    displayName: 'Lind',
  };
  const urban = { id: card(9).id, title: 'Urban Trail' };
  const lamp = { id: card(8).id, title: 'Warm Task Lighting' };
  const home: AgoraHomeResponse = {
    recommended: [card(1), card(2)],
    risingCreators: [AUTHOR, lind],
    newCreators: [lind],
    hotTopics: [
      { topic: urban, projects: [card(1), card(3)], projectCount: 9 },
      { topic: lamp, projects: [card(4)], projectCount: 1 },
    ],
  };

  it('Project 탭: 프로젝트 제목으로 거르고, 검색 중에는 창작자 줄을 비운다', () => {
    expect(filterAgoraHome(home, '')).toBe(home);
    const shown = filterAgoraHome(home, 'project 1');
    expect(shown.recommended.map((c) => c.title)).toEqual(['Project 1']);
    expect(shown.risingCreators).toEqual([]);
    expect(shown.newCreators).toEqual([]);
    expect(shown.hotTopics.map((e) => e.topic.title)).toEqual(['Urban Trail']);
    expect(shown.hotTopics[0]?.projects.map((c) => c.title)).toEqual(['Project 1']);
    // 거른 묶음도 주제 전체 수는 그대로 둔다
    expect(shown.hotTopics[0]?.projectCount).toBe(9);
  });

  it('Creator 탭: 창작자 이름으로(대소문자 무시)', () => {
    expect(filterCreators(home.risingCreators, 'LIN').map((c) => c.displayName)).toEqual(['Lind']);
    expect(filterCreators(home.risingCreators, '')).toHaveLength(2);
    expect(filterCreators(home.newCreators, 'judy')).toEqual([]);
  });

  it('Creator 탭은 라이징·새 창작자가 모두 없을 때만 비어 있다', () => {
    expect(isCreatorsEmpty(home)).toBe(false);
    expect(isCreatorsEmpty({ ...home, risingCreators: [] })).toBe(false);
    expect(isCreatorsEmpty({ ...home, risingCreators: [], newCreators: [] })).toBe(true);
  });

  it('Topic 탭: 주제 제목으로 묶음째, 핫토픽 화면은 프로젝트 제목으로', () => {
    expect(filterTopicEntries(home.hotTopics, 'warm').map((e) => e.topic.title)).toEqual([
      'Warm Task Lighting',
    ]);
    expect(filterTopicEntries(home.hotTopics, 'project')).toEqual([]);
    const topic: TopicResponse = { topic: urban, projects: [card(1), card(3)] };
    expect(filterTopicProjects(topic, '3').map((c) => c.title)).toEqual(['Project 3']);
    expect(filterTopicProjects(topic, 'urban')).toEqual([]);
  });
});

describe('topicExtraCount ("+N")', () => {
  const topic = { id: card(9).id, title: 'Urban Trail' };
  it('보이는 표지(최대 4장) 밖에 남은 공개 프로젝트 수, 없으면 0', () => {
    const six = Array.from({ length: 6 }, (_, i) => card(i));
    expect(topicExtraCount({ topic, projects: six, projectCount: 20 })).toBe(16);
    expect(topicExtraCount({ topic, projects: six.slice(0, 4), projectCount: 4 })).toBe(0);
    expect(topicExtraCount({ topic, projects: six.slice(0, 2), projectCount: 2 })).toBe(0);
    expect(topicExtraCount({ topic, projects: six.slice(0, 2), projectCount: 5 })).toBe(3);
    // 서버가 실수로 작은 수를 줘도 음수가 되지 않는다
    expect(topicExtraCount({ topic, projects: six, projectCount: 1 })).toBe(0);
  });
});
