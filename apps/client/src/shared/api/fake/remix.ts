import type {
  CreatorSummary,
  RemixCandidate,
  RemixCandidatesResponse,
  SetRemixPartnerResponse,
} from '@tome/shared';
import { FAKE_CREATOR } from './data';
import { FakeFailure } from './errors';
import { FAKE_OTHER_CREATORS } from './identity';
import type { FakeIdentityCase } from './state';
import { listProjects, setProjectRemixPartner, type FakeStore } from './store';

// 리믹스(서버 apps/server/src/modules/remix)의 가짜 응답. 상대·즐겨찾기만 다룬다(Connection 은 캔버스 단계에서).

/** 창작자마다 고정한 아이덴티티 스냅샷 id(서버는 상대를 고를 때 스냅샷을 고정한다). */
const SNAPSHOT_IDS: Record<string, string> = {
  '3e7a1c9d-4b2f-4d8e-a6c5-1f0b2d3e4a5c': 'c0ffee00-0000-4000-8000-000000000001',
  '8c4d2e6f-1a3b-4c5d-9e7f-2b4c6d8e0f1a': 'c0ffee00-0000-4000-8000-000000000002',
};

const CHOOSE_ANOTHER = 'Choose another creator.';

/**
 * 후보가 될 수 있는 사람: 나와 visitor 를 뺀 공개 창작자(서버 listEligible).
 * ?fakeIdentity=private 면 남의 아이덴티티가 모두 비공개라 후보가 0명이다(S-04 확인용).
 */
function eligible(identityCase: FakeIdentityCase): readonly CreatorSummary[] {
  if (identityCase === 'private') return [];
  return FAKE_OTHER_CREATORS.filter((creator) => creator.kind !== 'visitor');
}

function favoritesOf(s: FakeStore): string[] {
  s.favorites ??= [];
  return s.favorites;
}

function toCandidate(creator: CreatorSummary, favorites: readonly string[]): RemixCandidate {
  return {
    id: creator.id,
    displayName: creator.displayName,
    bio: creator.bio,
    avatarUrl: null,
    favorite: favorites.includes(creator.id),
    provisional: false,
  };
}

/** rising: 공개 창작자 순서대로 · favorite: 즐겨찾기한 순서대로(그중 후보가 될 수 있는 사람만). */
export function remixCandidates(
  s: FakeStore,
  tab: string | null,
  identityCase: FakeIdentityCase,
): RemixCandidatesResponse {
  if (tab !== 'rising' && tab !== 'favorite') throw new FakeFailure('VALIDATION_FAILED');
  const people = eligible(identityCase);
  const favorites = favoritesOf(s);
  const ordered =
    tab === 'rising'
      ? people
      : favorites.flatMap((id) => people.filter((creator) => creator.id === id));
  return { creators: ordered.map((creator) => toCandidate(creator, favorites)) };
}

/** 즐겨찾기(204). 자기 자신은 400, 모르는 사람은 NOT_FOUND. 이미 있으면 그대로. */
export function addFavorite(s: FakeStore, creatorId: string): void {
  if (creatorId === FAKE_CREATOR.id) {
    throw new FakeFailure('VALIDATION_FAILED', {
      fields: [{ path: 'creatorId', message: CHOOSE_ANOTHER }],
    });
  }
  if (!FAKE_OTHER_CREATORS.some((creator) => creator.id === creatorId)) {
    throw new FakeFailure('NOT_FOUND');
  }
  const favorites = favoritesOf(s);
  if (!favorites.includes(creatorId)) favorites.push(creatorId);
}

/** 즐겨찾기 해제(204). 없어도 그대로 성공한다(서버와 같다). */
export function removeFavorite(s: FakeStore, creatorId: string): void {
  s.favorites = favoritesOf(s).filter((id) => id !== creatorId);
}

/**
 * 리믹스 상대 지정·해제. 나 자신·visitor·모르는 사람은 400, 비공개면 IDENTITY_PRIVATE(서버 setPartner).
 * 고른 상대는 프로젝트 요약의 remixPartner 로 워크스페이스·서가 응답에 실린다.
 */
export function setRemixPartner(
  s: FakeStore,
  projectId: string,
  partnerId: string | null,
  identityCase: FakeIdentityCase,
): SetRemixPartnerResponse {
  // 서버처럼 내 프로젝트인지 먼저 본다(없거나 지운 것은 NOT_FOUND).
  if (!listProjects(s).some((project) => project.id === projectId)) {
    throw new FakeFailure('NOT_FOUND');
  }
  if (partnerId === null) {
    setProjectRemixPartner(s, projectId, null);
    return { remix: null };
  }
  const partner = FAKE_OTHER_CREATORS.find((creator) => creator.id === partnerId);
  if (partner === undefined || partner.kind === 'visitor') {
    throw new FakeFailure('VALIDATION_FAILED', {
      fields: [{ path: 'partnerId', message: CHOOSE_ANOTHER }],
    });
  }
  if (identityCase === 'private') throw new FakeFailure('IDENTITY_PRIVATE');
  setProjectRemixPartner(s, projectId, partner);
  const snapshotId = SNAPSHOT_IDS[partner.id] ?? 'c0ffee00-0000-4000-8000-000000000000';
  return { remix: { partner: { ...partner, avatarUrl: null }, snapshotId } };
}
