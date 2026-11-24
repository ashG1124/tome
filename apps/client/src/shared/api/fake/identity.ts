import type {
  CompareEntry,
  CompareResponse,
  CreatorProfileResponse,
  CreatorSummary,
  IdentityAxes,
  IdentityResponse,
  IdentitySnapshot,
} from '@tome/shared';
import { FAKE_CREATOR, FAKE_PROJECTS } from './data';
import { FakeFailure } from './errors';
import type { FakeIdentityCase } from './state';

const COMPUTED_AT = '2026-11-03T12:00:00.000Z';

/** 다른 창작자(시드). Compare 탭의 다른 점과 남의 프로필에 쓴다. */
export const FAKE_OTHER_CREATORS: readonly CreatorSummary[] = [
  {
    id: '3e7a1c9d-4b2f-4d8e-a6c5-1f0b2d3e4a5c',
    kind: 'seed',
    displayName: 'Lind',
    bio: 'Quiet shapes, loud colors.',
    avatarUrl: null,
  },
  {
    id: '8c4d2e6f-1a3b-4c5d-9e7f-2b4c6d8e0f1a',
    kind: 'seed',
    displayName: 'Mara',
    bio: null,
    avatarUrl: null,
  },
];

/** 남의 게시작. 남의 프로필에는 게시작만 보인다. */
const OTHER_WORKS: Record<string, CreatorProfileResponse['works']> = {
  '3e7a1c9d-4b2f-4d8e-a6c5-1f0b2d3e4a5c': [
    {
      id: '6f1e2d3c-4b5a-4968-8778-695a4b3c2d1e',
      title: 'Urban commuter shoe',
      status: 'finished',
      posted: true,
      coverThumbUrl: null,
      lastEditedAt: '2026-11-02T08:00:00.000Z',
      shelfPosition: 0,
      kind: 'original',
    },
  ],
  '8c4d2e6f-1a3b-4c5d-9e7f-2b4c6d8e0f1a': [],
};

const AXES: Record<string, IdentityAxes> = {
  [FAKE_CREATOR.id]: { scaleIntensity: 42, aiRelation: -18, decisionBasis: 35, direction: -24 },
  '3e7a1c9d-4b2f-4d8e-a6c5-1f0b2d3e4a5c': {
    scaleIntensity: -55,
    aiRelation: 60,
    decisionBasis: -40,
    direction: 70,
  },
  '8c4d2e6f-1a3b-4c5d-9e7f-2b4c6d8e0f1a': {
    scaleIntensity: 20,
    aiRelation: 45,
    decisionBasis: 65,
    direction: -50,
  },
};

const EMPTY_AXES: IdentityAxes = {
  scaleIntensity: null,
  aiRelation: null,
  decisionBasis: null,
  direction: null,
};

type Reach = Pick<CreatorProfileResponse, 'remixedBy' | 'derivedBy'>;
const NO_REACH: Reach = {
  remixedBy: { count: 0, creators: [] },
  derivedBy: { count: 0, creators: [] },
};
/** 머리글 "Remixed by N"·"Derived by N". 나는 다른 창작자 둘이 리믹스하고 한 명이 파생해 간 상태다. */
const REACH: Record<string, Reach> = {
  [FAKE_CREATOR.id]: {
    remixedBy: { count: 2, creators: [...FAKE_OTHER_CREATORS] },
    derivedBy: { count: 1, creators: [FAKE_OTHER_CREATORS[0]!] },
  },
};

function knownCreator(id: string): CreatorSummary {
  if (id === FAKE_CREATOR.id) return FAKE_CREATOR;
  const other = FAKE_OTHER_CREATORS.find((creator) => creator.id === id);
  if (!other) throw new FakeFailure('NOT_FOUND');
  return other;
}

/** 경우별 스냅샷. 다른 창작자는 늘 기록이 충분하고(시드), 고른 경우는 "나"에게만 적용한다. */
function snapshotOf(id: string, identityCase: FakeIdentityCase): IdentitySnapshot {
  const mine = id === FAKE_CREATOR.id;
  const scenario = mine ? identityCase : 'full';
  if (scenario === 'none') {
    return {
      algoVersion: 'identity-v1',
      axes: EMPTY_AXES,
      metrics: {
        sessions: 0,
        nodeEdits: 0,
        // 이유를 남길 수 있는 편집이 5개 미만이면 서버도 null 을 준다(#36). 화면은 Depth 를 "—" 로 보여 준다.
        reasonedRatio: null,
        firstRecordedAt: null,
        lastActiveAt: null,
        originBreakdown: { own: 0, remix: 0, derived: 0 },
      },
      eventCount: 0,
      projectCount: 0,
      provisional: true,
      computedAt: COMPUTED_AT,
    };
  }
  const provisional = scenario === 'provisional';
  return {
    algoVersion: 'identity-v1',
    axes: AXES[id] ?? EMPTY_AXES,
    metrics: {
      sessions: provisional ? 2 : 6,
      nodeEdits: provisional ? 9 : 31,
      reasonedRatio: provisional ? 0.4 : 0.62,
      firstRecordedAt: '2026-10-30T09:00:00.000Z',
      lastActiveAt: '2026-11-03T11:40:00.000Z',
      originBreakdown: provisional
        ? { own: 2, remix: 0, derived: 0 }
        : { own: 2, remix: 1, derived: 1 },
    },
    eventCount: provisional ? 30 : 120,
    projectCount: provisional ? 2 : 4,
    provisional,
    computedAt: COMPUTED_AT,
  };
}

/** 비공개는 "나" 말고 남을 볼 때만 막는다. 내 아이덴티티는 나에게 늘 보인다. */
function isHidden(id: string, identityCase: FakeIdentityCase): boolean {
  return identityCase === 'private' && id !== FAKE_CREATOR.id;
}

export function fakeCreatorProfile(
  id: string,
  identityCase: FakeIdentityCase,
): CreatorProfileResponse {
  const creator = knownCreator(id);
  const mine = id === FAKE_CREATOR.id;
  const works = mine ? FAKE_PROJECTS.filter((project) => project.posted) : (OTHER_WORKS[id] ?? []);
  const noRecord = mine && identityCase === 'none';
  return {
    creator,
    works: [...works],
    identity: noRecord || isHidden(id, identityCase) ? null : snapshotOf(id, identityCase),
    ...(REACH[id] ?? NO_REACH),
  };
}

export function fakeIdentity(id: string, identityCase: FakeIdentityCase): IdentityResponse {
  knownCreator(id);
  if (isHidden(id, identityCase)) throw new FakeFailure('IDENTITY_PRIVATE');
  const snapshot = snapshotOf(id, identityCase);
  const axes = Object.keys(snapshot.axes) as (keyof IdentityAxes)[];
  return {
    snapshot,
    table: axes.map((axis) => ({ axis, score: snapshot.axes[axis] })),
  };
}

export function fakeCompare(identityCase: FakeIdentityCase): CompareResponse {
  const entry = (creator: CreatorSummary): CompareEntry => {
    const snapshot = snapshotOf(creator.id, identityCase);
    return { creator, axes: snapshot.axes, provisional: snapshot.provisional };
  };
  // 비공개 창작자는 목록에서 빠진다.
  const others = FAKE_OTHER_CREATORS.filter((creator) => !isHidden(creator.id, identityCase));
  return { me: entry(FAKE_CREATOR), others: others.map(entry) };
}
