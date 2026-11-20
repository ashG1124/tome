import type {
  AgoraComment,
  AgoraHomeResponse,
  AgoraProjectCard,
  AgoraProjectResponse,
  Answer,
  CommentListResponse,
  CreateAgoraCommentRequest,
  CreatorSummary,
  DerivedFrom,
  ProjectKind,
  PromptSet,
  Topic,
  TopicResponse,
  DeriveProjectResponse,
} from '@tome/shared';
import { FAKE_CREATOR } from './data';
import { FakeFailure } from './errors';
import { FAKE_IMAGE_URL, fakeNodes, fakeSnapshot } from './generation';
import { FAKE_OTHER_CREATORS } from './identity';
import { addDerivedProject, type AgoraCommentRecord, type FakeStore } from './store';

// 아고라(서버 apps/server/src/modules/agora)의 가짜 응답.
// 남의 공개 프로젝트·토픽은 고정 데이터이고, 댓글과 파생으로 만든 내 프로젝트만 가짜 저장소에 남는다.
// 내가 게시한 프로젝트는 아직 이 목록에 넣지 않는다(가짜 서가에는 대표 답변 기록이 없어서).

/** 서버 agora.rules.ts 와 같은 개수 */
const RECOMMENDED_LIMIT = 12;
const RISING_LIMIT = 8;
const HOT_TOPIC_LIMIT = 5;
const HOT_TOPIC_PROJECT_LIMIT = 6;
const TOPIC_PROJECT_LIMIT = 50;
const DERIVATIVE_LIMIT = 12;
/** 서버 CommentQuerySchema 와 같다: 한 번에 기본 20개, 1~50개 */
const COMMENT_PAGE_DEFAULT = 20;
const COMMENT_PAGE_MAX = 50;

function seedCreator(index: number): CreatorSummary {
  const creator = FAKE_OTHER_CREATORS[index];
  if (creator === undefined) throw new Error('가짜 창작자가 없다');
  return creator;
}

const LIND = seedCreator(0);
const MARA = seedCreator(1);

const URBAN_TRAIL: Topic = { id: 'a7f1c2d3-0000-4000-8000-000000000001', title: 'Urban Trail' };
const WARM_LIGHTING: Topic = {
  id: 'a7f1c2d3-0000-4000-8000-000000000002',
  title: 'Warm Task Lighting',
};
/** 핫 토픽 묶음의 그림 칸 4개를 채우도록 공개 프로젝트를 4개 둔 토픽 */
const QUIET_HARBOR: Topic = { id: 'a7f1c2d3-0000-4000-8000-000000000003', title: 'Quiet Harbor' };

export const FAKE_TOPICS: readonly Topic[] = [URBAN_TRAIL, WARM_LIGHTING, QUIET_HARBOR];

/** 테스트·화면 확인용으로 고른 프로젝트 id */
export const FAKE_AGORA_IDS = {
  /** Lind 의 원작(프로필 Work 탭의 게시작과 같은 id). 파생작·댓글이 있다 */
  original: '6f1e2d3c-4b5a-4968-8778-695a4b3c2d1e',
  /** Mara 가 original 에서 파생한 작품 */
  derived: 'b3e9d2c1-0000-4000-8000-000000000002',
  /** 원작이 지워진 파생작(derivedFrom 의 title·answerId 가 null → "Deleted original") */
  deletedOriginalDerive: 'b3e9d2c1-0000-4000-8000-000000000004',
  /** 대표 답변이 없는 공개작(표지 없음, 파생하면 DERIVE_SOURCE_UNAVAILABLE) */
  noCover: 'b3e9d2c1-0000-4000-8000-000000000005',
  /** 지워진 원작. 상세는 NOT_FOUND, 파생은 DERIVE_SOURCE_UNAVAILABLE(서버와 같다) */
  deletedOriginal: 'e8f7a6b5-0000-4000-8000-000000000001',
} as const;

interface PublicProject {
  id: string;
  title: string;
  kind: ProjectKind;
  author: CreatorSummary;
  topicId: string | null;
  postedAt: string;
  /** 서버 집계 점수(조회 + 리믹스 + 파생) 대신 쓰는 고정 값 */
  score: number;
  likeCount: number;
  /** 대표 답변이 있는 세트. null 이면 대표가 없어 표지가 없고 파생할 수 없다 */
  cover: { setId: string; answerId: string; prompt: string } | null;
  reason?: string;
  /** 파생작이면 원작 id */
  derivedFromId?: string;
}

/**
 * 핫 토픽 묶음이 그림 칸 4개를 채우도록 토픽마다 덧붙인 공개작.
 * 점수 0 + 오래된 게시일이라 추천 12개 자리에서 기존 공개작보다 뒤에 서고, 라이징 순위도 바꾸지 않는다.
 */
function fillerProject(
  n: number,
  title: string,
  author: CreatorSummary,
  topicId: string,
  prompt: string,
): PublicProject {
  const tail = String(n).padStart(12, '0');
  return {
    id: `b3e9d2c1-0000-4000-8000-${tail}`,
    title,
    kind: 'original',
    author,
    topicId,
    postedAt: `2026-10-${String(30 - (n % 10)).padStart(2, '0')}T08:00:00.000Z`,
    score: 0,
    likeCount: n % 4,
    cover: {
      setId: `c5d4e3f2-0000-4000-8000-${tail}`,
      answerId: `d6e5f4a3-0000-4000-8000-${tail}`,
      prompt,
    },
  };
}

const PUBLIC_PROJECTS: readonly PublicProject[] = [
  {
    id: FAKE_AGORA_IDS.original,
    title: 'Urban commuter shoe',
    kind: 'original',
    author: LIND,
    topicId: URBAN_TRAIL.id,
    postedAt: '2026-11-02T08:00:00.000Z',
    score: 40,
    likeCount: 12,
    cover: {
      setId: 'c5d4e3f2-0000-4000-8000-000000000001',
      answerId: 'd6e5f4a3-0000-4000-8000-000000000001',
      prompt: 'A commuter sneaker with a reflective heel on a rainy street',
    },
    reason: 'Kept the sole simple so the color does the work.',
  },
  {
    id: FAKE_AGORA_IDS.derived,
    title: 'Night run, reflective heel',
    kind: 'derive',
    author: MARA,
    topicId: URBAN_TRAIL.id,
    postedAt: '2026-11-03T09:00:00.000Z',
    score: 18,
    likeCount: 5,
    cover: {
      setId: 'c5d4e3f2-0000-4000-8000-000000000002',
      answerId: 'd6e5f4a3-0000-4000-8000-000000000002',
      prompt: 'The same sneaker at night under a street lamp',
    },
    derivedFromId: FAKE_AGORA_IDS.original,
  },
  {
    id: 'b3e9d2c1-0000-4000-8000-000000000003',
    title: 'Desk lamp in warm light',
    kind: 'original',
    author: MARA,
    topicId: WARM_LIGHTING.id,
    postedAt: '2026-11-01T15:00:00.000Z',
    score: 25,
    likeCount: 8,
    cover: {
      setId: 'c5d4e3f2-0000-4000-8000-000000000003',
      answerId: 'd6e5f4a3-0000-4000-8000-000000000003',
      prompt: 'A brass desk lamp casting warm light on a wooden desk',
    },
  },
  {
    id: FAKE_AGORA_IDS.deletedOriginalDerive,
    title: 'Harbor at dusk',
    kind: 'derive',
    author: LIND,
    topicId: QUIET_HARBOR.id,
    postedAt: '2026-10-31T18:00:00.000Z',
    score: 6,
    likeCount: 2,
    cover: {
      setId: 'c5d4e3f2-0000-4000-8000-000000000004',
      answerId: 'd6e5f4a3-0000-4000-8000-000000000004',
      prompt: 'A small harbor at dusk with two fishing boats',
    },
    derivedFromId: FAKE_AGORA_IDS.deletedOriginal,
  },
  {
    id: FAKE_AGORA_IDS.noCover,
    title: 'Paper texture study',
    kind: 'original',
    author: MARA,
    topicId: null,
    postedAt: '2026-10-30T11:00:00.000Z',
    score: 0,
    likeCount: 0,
    cover: null,
  },
  fillerProject(
    6,
    'Rain-ready trail runner',
    LIND,
    URBAN_TRAIL.id,
    'A trail runner with a grippy sole on a wet city staircase',
  ),
  fillerProject(
    7,
    'Crosswalk stripe sneaker',
    MARA,
    URBAN_TRAIL.id,
    'A white sneaker with bold black stripes on a crosswalk',
  ),
  fillerProject(
    8,
    'Reading lamp with linen shade',
    LIND,
    WARM_LIGHTING.id,
    'A reading lamp with a linen shade glowing beside a notebook',
  ),
  fillerProject(
    9,
    'Amber task light on a shelf',
    MARA,
    WARM_LIGHTING.id,
    'A small amber task light clipped to a wooden shelf',
  ),
  fillerProject(
    10,
    'Bedside lamp, soft glow',
    LIND,
    WARM_LIGHTING.id,
    'A round bedside lamp with a soft glow on a bedside table',
  ),
  fillerProject(
    11,
    'Morning ferry dock',
    MARA,
    QUIET_HARBOR.id,
    'A wooden ferry dock in pale morning light with calm water',
  ),
  fillerProject(
    12,
    'Lighthouse in fog',
    LIND,
    QUIET_HARBOR.id,
    'A white lighthouse half hidden in soft sea fog',
  ),
  fillerProject(
    13,
    'Rowboats at low tide',
    MARA,
    QUIET_HARBOR.id,
    'Three small rowboats resting on wet sand at low tide',
  ),
];

const FAKE_COMMENT_IDS = [
  'f1a2b3c4-0000-4000-8000-000000000001',
  'f1a2b3c4-0000-4000-8000-000000000002',
] as const;

/** 처음 댓글: 원작에 Mara 의 댓글과 내 댓글(지우기 버튼 확인용) */
function seedComments(): AgoraCommentRecord[] {
  return [
    {
      id: FAKE_COMMENT_IDS[0],
      projectId: FAKE_AGORA_IDS.original,
      authorId: MARA.id,
      body: 'The reflective heel reads well even at night.',
      createdAt: '2026-11-02T10:00:00.000Z',
    },
    {
      id: FAKE_COMMENT_IDS[1],
      projectId: FAKE_AGORA_IDS.original,
      authorId: FAKE_CREATOR.id,
      body: 'Love the sole shape.',
      createdAt: '2026-11-02T12:00:00.000Z',
    },
  ];
}

/** 이 칸이 생기기 전에 저장한 가짜 데이터에는 댓글이 없어서, 처음 쓸 때 채운다. */
function commentsOf(s: FakeStore): AgoraCommentRecord[] {
  s.agoraComments ??= seedComments();
  return s.agoraComments;
}

function creatorOf(id: string): CreatorSummary {
  if (id === FAKE_CREATOR.id) return FAKE_CREATOR;
  return FAKE_OTHER_CREATORS.find((creator) => creator.id === id) ?? FAKE_CREATOR;
}

function visibleComments(s: FakeStore, projectId: string): AgoraCommentRecord[] {
  return commentsOf(s).filter((c) => c.projectId === projectId && c.deleted !== true);
}

/** 공개 프로젝트가 아니면(없음·지움·게시 내림) NOT_FOUND(서버 requirePublic 과 같다). */
function requirePublic(id: string): PublicProject {
  const project = PUBLIC_PROJECTS.find((p) => p.id === id);
  if (!project) throw new FakeFailure('NOT_FOUND');
  return project;
}

/** 서버 rankProjects 와 같다: 점수 내림차순 → 최근 게시 → id. */
function ranked(projects: readonly PublicProject[]): PublicProject[] {
  return [...projects].sort(
    (a, b) =>
      b.score - a.score ||
      b.postedAt.localeCompare(a.postedAt) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

function toCard(s: FakeStore, project: PublicProject): AgoraProjectCard {
  return {
    id: project.id,
    title: project.title,
    kind: project.kind,
    author: project.author,
    // 서버는 /assets/answers/:id/thumb 를 주지만 가짜에는 그 경로를 줄 서버가 없다(FAKE_IMAGE_URL 설명)
    coverThumbUrl: project.cover ? FAKE_IMAGE_URL : null,
    likeCount: project.likeCount,
    commentCount: visibleComments(s, project.id).length,
  };
}

function coverAnswerOf(project: PublicProject): Answer | null {
  if (!project.cover) return null;
  return {
    id: project.cover.answerId,
    number: 1,
    pinned: false,
    isSample: false,
    thumbUrl: FAKE_IMAGE_URL,
    createdAt: project.postedAt,
    setId: project.cover.setId,
    status: 'accepted',
    origin: project.kind === 'derive' ? 'derived_copy' : 'generated',
    imageMode: 'generate',
    baseAnswerId: null,
    imageUrl: FAKE_IMAGE_URL,
    nodes: fakeSnapshot(fakeNodes('analyze')),
    verification: null,
  };
}

/** 상세의 세트: 대표 답변이 든 세트 하나(서버 coverSets 처럼 공개된 답변만). */
function coverSetsOf(project: PublicProject): PromptSet[] {
  const answer = coverAnswerOf(project);
  if (!project.cover || !answer) return [];
  const { id, number, pinned, isSample, thumbUrl, createdAt } = answer;
  return [
    {
      id: project.cover.setId,
      position: 1,
      prompt: project.cover.prompt,
      latestAnswer: answer,
      answers: [{ id, number, pinned, isSample, thumbUrl, createdAt }],
    },
  ];
}

/** 원작이 공개면 제목·답변 id 까지, 지워졌으면 id 만(서버 toDerivedFrom 과 같다). */
function derivedFromOf(project: PublicProject): DerivedFrom | null {
  if (project.derivedFromId === undefined) return null;
  const original = PUBLIC_PROJECTS.find((p) => p.id === project.derivedFromId);
  if (!original) return { projectId: project.derivedFromId, answerId: null, title: null };
  return {
    projectId: original.id,
    answerId: original.cover?.answerId ?? null,
    title: original.title,
  };
}

// ---- 홈·토픽·상세 ----

export function agoraHome(s: FakeStore): AgoraHomeResponse {
  const all = ranked(PUBLIC_PROJECTS);
  // 라이징: 공개작 점수 합 내림차순 → 가장 최근 게시 순(서버 rankCreators)
  const byCreator = new Map<string, { creator: CreatorSummary; score: number; latest: string }>();
  for (const project of all) {
    const entry = byCreator.get(project.author.id);
    if (!entry) {
      byCreator.set(project.author.id, {
        creator: project.author,
        score: project.score,
        latest: project.postedAt,
      });
    } else {
      entry.score += project.score;
      if (project.postedAt > entry.latest) entry.latest = project.postedAt;
    }
  }
  const risingCreators = [...byCreator.values()]
    .sort((a, b) => b.score - a.score || b.latest.localeCompare(a.latest))
    .slice(0, RISING_LIMIT)
    .map((entry) => entry.creator);
  const hotTopics = FAKE_TOPICS.map((topic) => ({
    topic: { ...topic },
    projects: all.filter((p) => p.topicId === topic.id),
  }))
    .filter((entry) => entry.projects.length > 0)
    .slice(0, HOT_TOPIC_LIMIT)
    .map((entry) => ({
      topic: entry.topic,
      projects: entry.projects.slice(0, HOT_TOPIC_PROJECT_LIMIT).map((p) => toCard(s, p)),
    }));
  return {
    recommended: all.slice(0, RECOMMENDED_LIMIT).map((p) => toCard(s, p)),
    risingCreators,
    hotTopics,
  };
}

export function agoraTopic(s: FakeStore, id: string): TopicResponse {
  const topic = FAKE_TOPICS.find((t) => t.id === id);
  if (!topic) throw new FakeFailure('NOT_FOUND');
  return {
    topic: { ...topic },
    projects: ranked(PUBLIC_PROJECTS.filter((p) => p.topicId === id))
      .slice(0, TOPIC_PROJECT_LIMIT)
      .map((p) => toCard(s, p)),
  };
}

export function agoraProject(s: FakeStore, id: string): AgoraProjectResponse {
  const project = requirePublic(id);
  const derivatives = PUBLIC_PROJECTS.filter((p) => p.derivedFromId === id)
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt) || (a.id < b.id ? 1 : -1))
    .slice(0, DERIVATIVE_LIMIT);
  const response: AgoraProjectResponse = {
    project: toCard(s, project),
    author: project.author,
    coverImageUrl: project.cover ? FAKE_IMAGE_URL : null,
    sets: coverSetsOf(project),
    commentCount: visibleComments(s, id).length,
    derivatives: derivatives.map((p) => toCard(s, p)),
  };
  if (project.reason !== undefined) response.reason = project.reason;
  const derivedFrom = derivedFromOf(project);
  if (derivedFrom) response.derivedFrom = derivedFrom;
  return response;
}

/** 조회 기록(204). 서버는 같은 날 한 번만 세는데, 가짜는 공개작인지만 본다. */
export function recordAgoraView(id: string): void {
  requirePublic(id);
}

// ---- 파생 ----

/** 서버 derive 와 같다: 대표 답변을 복사해 내 서가 맨 앞에 kind derive 프로젝트를 만든다. */
export function deriveFromAgora(s: FakeStore, id: string): DeriveProjectResponse {
  if (id === FAKE_AGORA_IDS.deletedOriginal) throw new FakeFailure('DERIVE_SOURCE_UNAVAILABLE');
  const project = requirePublic(id);
  const answer = coverAnswerOf(project);
  if (!project.cover || !answer) throw new FakeFailure('DERIVE_SOURCE_UNAVAILABLE');
  return addDerivedProject(s, { title: project.title, prompt: project.cover.prompt, answer });
}

// ---- 댓글 ----

function toComment(record: AgoraCommentRecord): AgoraComment {
  return {
    id: record.id,
    author: creatorOf(record.authorId),
    body: record.body,
    createdAt: record.createdAt,
    mine: record.authorId === FAKE_CREATOR.id,
  };
}

/** 새 댓글부터(createdAt·id 내림차순). before 에 받은 마지막 댓글 id 를 주면 그 다음 묶음. */
export function listAgoraComments(
  s: FakeStore,
  projectId: string,
  query: URLSearchParams,
): CommentListResponse {
  requirePublic(projectId);
  const rawLimit = query.get('limit');
  const limit = rawLimit === null ? COMMENT_PAGE_DEFAULT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > COMMENT_PAGE_MAX) {
    throw new FakeFailure('VALIDATION_FAILED');
  }
  const newest = visibleComments(s, projectId).sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || (a.id < b.id ? 1 : -1),
  );
  const before = query.get('before');
  let start = 0;
  if (before !== null) {
    // 서버도 다른 프로젝트의 댓글이나 모르는 id 를 주면 400 이다
    const cursor = commentsOf(s).find((c) => c.id === before);
    if (!cursor || cursor.projectId !== projectId) throw new FakeFailure('VALIDATION_FAILED');
    start = newest.filter(
      (c) =>
        c.createdAt > cursor.createdAt || (c.createdAt === cursor.createdAt && c.id >= cursor.id),
    ).length;
  }
  return { comments: newest.slice(start, start + limit).map(toComment) };
}

export function createAgoraComment(
  s: FakeStore,
  projectId: string,
  body: CreateAgoraCommentRequest,
): { comment: AgoraComment } {
  requirePublic(projectId);
  const record: AgoraCommentRecord = {
    id: crypto.randomUUID(),
    projectId,
    authorId: FAKE_CREATOR.id,
    body: body.body,
    createdAt: new Date().toISOString(),
  };
  commentsOf(s).push(record);
  return { comment: toComment(record) };
}

/** 내 댓글만 지운다. 없거나 지운 것은 NOT_FOUND, 남의 것은 FORBIDDEN(서버와 같다). */
export function deleteAgoraComment(s: FakeStore, commentId: string): void {
  const record = commentsOf(s).find((c) => c.id === commentId);
  if (!record || record.deleted === true) throw new FakeFailure('NOT_FOUND');
  if (record.authorId !== FAKE_CREATOR.id) {
    requirePublic(record.projectId);
    throw new FakeFailure('FORBIDDEN');
  }
  record.deleted = true;
}
