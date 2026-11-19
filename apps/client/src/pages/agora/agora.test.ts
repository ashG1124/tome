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
  formatCount,
  isAgoraEmpty,
  isTopicEmpty,
  TOPIC_TILE_COUNT,
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
  it('앞의 4개 표지를 보여 주고, 나머지 개수를 +N 으로 준다', () => {
    const tiles = topicTiles([1, 2, 3, 4, 5, 6].map((n) => card(n)));
    expect(tiles.covers).toHaveLength(TOPIC_TILE_COUNT);
    expect(tiles.covers[0]).toBe('/assets/answers/a1/thumb');
    expect(tiles.more).toBe(2);
  });

  it('4개보다 적으면 있는 만큼만, 표지 없는 프로젝트는 빈 칸(null)으로 둔다', () => {
    const tiles = topicTiles([card(1), card(2, null), card(3)]);
    expect(tiles.covers).toEqual(['/assets/answers/a1/thumb', null, '/assets/answers/a3/thumb']);
    expect(tiles.more).toBe(0);
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
  const emptyHome: AgoraHomeResponse = { recommended: [], risingCreators: [], hotTopics: [] };

  it('게시된 프로젝트가 하나도 없으면 아고라가 빈 것으로 본다(크리에이터만 있어도)', () => {
    expect(isAgoraEmpty(emptyHome)).toBe(true);
    expect(isAgoraEmpty({ ...emptyHome, risingCreators: [AUTHOR] })).toBe(true);
    expect(
      isAgoraEmpty({
        ...emptyHome,
        hotTopics: [{ topic: { id: card(9).id, title: 'Urban Trail' }, projects: [] }],
      }),
    ).toBe(true);
  });

  it('추천이나 핫토픽에 프로젝트가 하나라도 있으면 비어 있지 않다', () => {
    expect(isAgoraEmpty({ ...emptyHome, recommended: [card(1)] })).toBe(false);
    expect(
      isAgoraEmpty({
        ...emptyHome,
        hotTopics: [{ topic: { id: card(9).id, title: 'Urban Trail' }, projects: [card(1)] }],
      }),
    ).toBe(false);
  });

  it('핫토픽에 프로젝트가 없으면 목록 대신 빈 안내를 보여 준다', () => {
    const topic: TopicResponse = { topic: { id: card(9).id, title: 'Urban Trail' }, projects: [] };
    expect(isTopicEmpty(topic)).toBe(true);
    expect(isTopicEmpty({ ...topic, projects: [card(1)] })).toBe(false);
  });
});
