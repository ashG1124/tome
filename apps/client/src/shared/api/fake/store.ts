import {
  type UpdateVerificationRequest,
  type UpdateVerificationResponse,
  type GetAnswerResponse,
  type PinAnswerResponse,
  type NodeComment,
  type NodeCommentListResponse,
  type CreateNodeCommentRequest,
  type CreateNodeCommentResponse,
  LIMITS,
  type AcceptAnswerResponse,
  type CreateRevisionRequest,
  type CreateRevisionResponse,
  type NodeSnapshot,
  PROMPT_PRESETS,
  type AdvanceJobResponse,
  type Answer,
  type AnswerSummary,
  type CancelJobResponse,
  type CreatePageResponse,
  type CreateProjectRequest,
  type CreateProjectResponse,
  type CreateSetRequest,
  type CreateSetResponse,
  type FinishCandidatesResponse,
  type FinishProjectRequest,
  type FinishProjectResponse,
  type GetJobResponse,
  type Job,
  type JobStage,
  type JobStep,
  type Node,
  type PostProjectRequest,
  type PostProjectResponse,
  type ProjectSummary,
  type PromptSet,
  type UpdateProjectRequest,
  type UpdateProjectResponse,
  type WorkspaceResponse,
  type WorkspaceDerivedFrom,
} from '@tome/shared';
import { FAKE_CREATOR, FAKE_PAGE_IDS, FAKE_PROJECTS } from './data';
import { FakeFailure } from './errors';
import { FAKE_OTHER_CREATORS } from './identity';
import {
  FAKE_IMAGE_URL,
  FAKE_STAGE_ORDER,
  fakeNodes,
  fakeRevisionPlan,
  fakeSnapshot,
  fakeVerification,
  isTextStage,
  nextStageOf,
} from './generation';

// 가짜 서버가 기억하는 데이터. 서버(apps/server/src/modules/projects·generation)와 같은 규칙으로 바꾼다.

interface PageRecord {
  id: string;
  index: number;
}

interface SetRecord {
  id: string;
  pageId: string;
  position: number;
  prompt: string;
  /** 프리셋으로 만든 세트면 그 키. 대체 결과(sample)는 프리셋 문장 그대로일 때만 준다 */
  presetKey?: string;
  answers: Answer[];
}

interface ProjectRecord {
  summary: ProjectSummary;
  /** 지운 프로젝트(소프트 삭제). 목록·조회에서 빠진다. */
  deleted?: boolean;
  /** 게시한 시각. 게시하지 않았으면 null */
  postedAt?: string | null;
  pages: PageRecord[];
  sets: SetRecord[];
  /** 파생 프로젝트의 원작 표시(서버 workspace 의 derivedFrom). 원작 프로젝트에는 없다 */
  derivedFrom?: WorkspaceDerivedFrom;
}

interface JobRecord {
  id: string;
  projectId: string;
  setId: string;
  /** 세트가 있는 페이지. Job 응답에 setId 와 같이 나간다(#68) */
  pageId: string;
  status: Job['status'];
  startStage: JobStage;
  nextStage: JobStage | null;
  steps: JobStep[];
  /** 대체 결과로 채우는 job(상한·AI 실패 + 프리셋 그대로). 이후 단계도 AI 를 부르지 않는다 */
  sample?: boolean;
  revision?: { baseAnswerId: string; nodes: NodeSnapshot; appliedConnectionIds?: string[] };
}

/** 주소 옵션으로 고르는 생성 조건(?fakeLimit= · ?fakeSample=). 가짜 라우트가 넘긴다. */
export interface FakeGenerationOptions {
  limit: 'none' | 'daily' | 'budget';
  sample: boolean;
}

const NO_OPTIONS: FakeGenerationOptions = { limit: 'none', sample: false };

/** 성공한 멱등 요청의 기록. 같은 키 + 같은 요청이면 처음 응답을 그대로 돌려준다. */
export interface IdempotencyRecord {
  /** 메서드·경로·본문을 이은 값. 같은 키로 다른 요청이 오면 IDEMPOTENCY_KEY_REUSED */
  request: string;
  status: number;
  body: unknown;
}

/** 아고라 댓글(서버 AgoraComment). 지운 댓글은 deleted 로 남기고 목록에서 뺀다. */
export interface AgoraCommentRecord {
  id: string;
  projectId: string;
  authorId: string;
  body: string;
  createdAt: string;
  deleted?: boolean;
}

export interface FakeStore {
  projects: ProjectRecord[];
  jobs: JobRecord[];
  idempotency: Record<string, IdempotencyRecord>;
  /** 리믹스 즐겨찾기한 창작자 id(넣은 순서). 이 칸이 생기기 전에 저장한 데이터에는 없다(fake/remix.ts). */
  favorites?: string[];
  /** 리믹스 Connection(답변·상대마다 처음 조회할 때 만든다, fake/remix.ts). */
  connections?: ConnectionRecord[];
  /** 아고라 댓글. 이 칸이 생기기 전에 저장한 데이터에는 없어서 처음 쓸 때 채운다(fake/agora.ts). */
  agoraComments?: AgoraCommentRecord[];
  nodeComments?: (NodeComment & { answerId: string; deleted?: boolean })[];
}

/** 가짜 Connection 한 줄(서버 Connection 표와 같은 뜻). */
export interface ConnectionRecord {
  id: string;
  answerId: string;
  partnerId: string;
  nodeId: string;
  predictedAction: string;
  sentence: string;
  status: 'shown' | 'applied' | 'dismissed';
}

let store: FakeStore | null = null;
/** ?fakeProjects=empty 로 시작한 빈 서가는 저장하지 않는다(옵션 없이 다시 열면 기본 데이터로 돌아온다). */
let persist = true;

/** 새로고침해도 가짜 데이터가 남도록 브라우저 저장소에 둔다. 저장소를 못 쓰면 이번 탭 메모리에서만 유지한다. */
// v2: Job 에 pageId 를 담기 시작했다(#68). 예전(v1) 데이터는 버리고 처음 데이터로 시작한다.
const STORE_KEY = 'tome.fake.store.v2';

function load(): FakeStore | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw === null ? null : (JSON.parse(raw) as FakeStore);
  } catch {
    return null;
  }
}

/** 바뀐 가짜 데이터를 저장한다(가짜 전송 계층이 GET 이 아닌 요청 뒤에 부른다). */
export function saveFakeStore(): void {
  if (store === null || !persist) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // 저장소를 쓸 수 없으면 메모리에서만 유지한다.
  }
}

/**
 * 처음 쓸 때 저장해 둔 데이터를, 없으면 고정 데이터를 쓴다.
 * emptyProjects(주소의 ?fakeProjects=empty)면 저장해 둔 데이터가 있어도 빈 서가로 새로 시작하고, 그 빈 서가는 저장하지 않는다.
 */
export function fakeStore(emptyProjects: boolean): FakeStore {
  if (store === null) {
    persist = !emptyProjects;
    store = emptyProjects ? seed(true) : (load() ?? seed(false));
  }
  return store;
}

/** 새로고침 흉내(테스트용): 메모리만 비운다. 다음에 쓸 때 저장해 둔 데이터를 다시 읽는다. */
export function dropFakeStoreMemory(): void {
  store = null;
}

/** 다음에 쓸 때 처음 상태로 다시 채운다(resetFake 가 부른다). 저장해 둔 데이터도 지운다. */
export function resetFakeStore(): void {
  store = null;
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // 저장소를 쓸 수 없으면 지울 것도 없다.
  }
}

function seed(emptyProjects: boolean): FakeStore {
  if (emptyProjects) return { projects: [], jobs: [], idempotency: {} };
  return {
    projects: FAKE_PROJECTS.map((summary) => ({
      summary: { ...summary },
      postedAt: summary.posted ? summary.lastEditedAt : null,
      pages: (FAKE_PAGE_IDS[summary.id] ?? []).map((id, index) => ({ id, index })),
      sets: [],
    })),
    jobs: [],
    idempotency: {},
  };
}

const newId = (): string => crypto.randomUUID();
const now = (): string => new Date().toISOString();

/** 같은 프로젝트에 진행 중(pending·running)인 job 은 하나뿐이다(서버와 같다). */
const ACTIVE_STATUSES: readonly Job['status'][] = ['pending', 'running'];

function shelf(s: FakeStore): ProjectRecord[] {
  return s.projects
    .filter((p) => p.deleted !== true)
    .sort((a, b) => a.summary.shelfPosition - b.summary.shelfPosition);
}

function projectOf(s: FakeStore, id: string): ProjectRecord {
  const record = s.projects.find((p) => p.summary.id === id && p.deleted !== true);
  if (!record) throw new FakeFailure('NOT_FOUND');
  return record;
}

function jobOf(s: FakeStore, id: string): JobRecord {
  const job = s.jobs.find((j) => j.id === id);
  if (!job) throw new FakeFailure('NOT_FOUND');
  return job;
}

function activeJobOf(s: FakeStore, projectId: string): JobRecord | undefined {
  return s.jobs.find((j) => j.projectId === projectId && ACTIVE_STATUSES.includes(j.status));
}

function toJob(job: JobRecord): Job {
  return {
    id: job.id,
    setId: job.setId,
    pageId: job.pageId,
    status: job.status,
    startStage: job.startStage,
    nextStage: job.nextStage,
    steps: job.steps.map(({ stage, status }) => ({ stage, status })),
  };
}

function toAnswerSummary(answer: Answer): AnswerSummary {
  const { id, number, pinned, isSample, thumbUrl, createdAt } = answer;
  return { id, number, pinned, isSample, thumbUrl, createdAt };
}

function toPromptSet(set: SetRecord): PromptSet {
  const accepted = set.answers
    .filter((answer) => answer.status === 'accepted')
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  return {
    id: set.id,
    position: set.position,
    prompt: set.prompt,
    latestAnswer: accepted[accepted.length - 1] ?? null,
    answers: accepted.map(toAnswerSummary),
  };
}

/** 서버 normalizePrompt·matchPreset 과 같다: 프리셋 문장 그대로(공백·대소문자 무시)일 때만 그 키. */
function matchPreset(presetKey: string | undefined, prompt: string): string | null {
  if (presetKey === undefined) return null;
  const preset = PROMPT_PRESETS.find((p) => p.key === presetKey);
  const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();
  return preset !== undefined && normalize(preset.prompt) === normalize(prompt) ? preset.key : null;
}

function limitCode(
  options: FakeGenerationOptions,
): 'DAILY_LIMIT_REACHED' | 'BUDGET_REACHED' | null {
  if (options.limit === 'budget') return 'BUDGET_REACHED';
  if (options.limit === 'daily') return 'DAILY_LIMIT_REACHED';
  return null;
}

/** 서버 assertWithinLimitsOrSample 과 같다: 상한에 닿았어도 프리셋 문장 그대로면 통과(뒤에 대체 결과로 채움). */
function assertWithinLimitsOrSample(
  options: FakeGenerationOptions,
  presetKey: string | undefined,
  prompt: string,
): void {
  const code = limitCode(options);
  if (code !== null && matchPreset(presetKey, prompt) === null) throw new FakeFailure(code);
}

/** 서버 makeTitle 과 같다: 앞뒤 공백을 정리하고 앞 60자. */
function makeTitle(prompt: string): string {
  return prompt.trim().slice(0, LIMITS.TITLE_MAX).trim();
}

/** prompt 가 없고 presetKey 만 있으면 프리셋 문장을 프롬프트로 쓴다(서버와 같다). */
function resolvePrompt(body: CreateProjectRequest): string | undefined {
  if (body.prompt !== undefined) return body.prompt;
  if (body.presetKey === undefined) return undefined;
  return PROMPT_PRESETS.find((preset) => preset.key === body.presetKey)?.prompt;
}

// ---- 서가 ----

export function listProjects(s: FakeStore): ProjectSummary[] {
  return shelf(s).map((p) => ({ ...p.summary }));
}

/** 새 프로젝트는 서가 맨 앞(0번). 프롬프트가 있으면 Page 0 에 세트 1개와 job 까지 만든다. */
export function createProject(
  s: FakeStore,
  body: CreateProjectRequest,
  options: FakeGenerationOptions = NO_OPTIONS,
): CreateProjectResponse {
  // 첨부는 첨부 단계(T11) 전까지 서버도 400 이다.
  if (body.attachmentId !== undefined) throw new FakeFailure('VALIDATION_FAILED');
  // 리믹스 상대는 있는 다른 창작자일 때만 저장한다(서버와 같다). 나 자신이나 모르는 id 는 400.
  const partner =
    body.remixPartnerId === undefined
      ? undefined
      : FAKE_OTHER_CREATORS.find((creator) => creator.id === body.remixPartnerId);
  if (body.remixPartnerId !== undefined && partner === undefined) {
    throw new FakeFailure('VALIDATION_FAILED', {
      fields: [{ path: 'remixPartnerId', message: 'Choose another creator.' }],
    });
  }
  const prompt = resolvePrompt(body);
  if (prompt !== undefined) assertWithinLimitsOrSample(options, body.presetKey, prompt);
  for (const record of s.projects) record.summary.shelfPosition += 1;
  const record: ProjectRecord = {
    summary: {
      id: newId(),
      title: prompt === undefined ? 'Untitled' : makeTitle(prompt),
      status: 'building',
      posted: false,
      coverThumbUrl: null,
      lastEditedAt: now(),
      shelfPosition: 0,
      kind: 'original',
      ...(partner === undefined ? {} : { remixPartner: { ...partner } }),
    },
    pages: [{ id: newId(), index: 0 }],
    sets: [],
  };
  s.projects.push(record);
  const firstPage = record.pages[0];
  if (prompt === undefined || firstPage === undefined) return { project: { ...record.summary } };
  const { set, job } = addSet(s, record, firstPage.id, prompt, body.presetKey);
  return { project: { ...record.summary }, set, job };
}

/** 순서를 옮기면 보이는 것만 0부터 다시 번호를 매긴다. 제목을 바꿀 때만 lastEditedAt 을 바꾼다. */
export function updateProject(
  s: FakeStore,
  id: string,
  body: UpdateProjectRequest,
): UpdateProjectResponse {
  const record = projectOf(s, id);
  if (body.shelfPosition !== undefined) {
    const order = shelf(s)
      .map((p) => p.summary.id)
      .filter((other) => other !== id);
    order.splice(Math.min(body.shelfPosition, order.length), 0, id);
    order.forEach((projectId, index) => {
      projectOf(s, projectId).summary.shelfPosition = index;
    });
  }
  if (body.title !== undefined) {
    record.summary.title = body.title;
    record.summary.lastEditedAt = now();
  }
  return { project: { ...record.summary } };
}

/** 지우기(소프트 삭제). 남은 프로젝트는 서가 순서를 0부터 다시 매긴다. 진행 중 job 은 취소한다. */
export function deleteProject(s: FakeStore, id: string): void {
  const record = projectOf(s, id);
  record.deleted = true;
  for (const job of s.jobs) {
    if (job.projectId === id && ACTIVE_STATUSES.includes(job.status)) job.status = 'cancelled';
  }
  shelf(s).forEach((project, index) => {
    project.summary.shelfPosition = index;
  });
}

// ---- 아고라 파생 ----

/** 파생할 원작의 제목·대표 세트 프롬프트·대표 답변(fake/agora.ts 가 넘긴다). */
export interface DeriveSource {
  title: string;
  prompt: string;
  answer: Answer;
  derivedFrom: WorkspaceDerivedFrom;
}

/**
 * 서버 derive 와 같다: 내 서가 맨 앞(0번)에 kind derive 프로젝트를 만들고, Page 0 의 세트 1개에
 * 원작 대표 답변을 복사해 둔다(origin derived_copy, 번호 1). job 은 만들지 않는다.
 */
export function addDerivedProject(s: FakeStore, source: DeriveSource): UpdateProjectResponse {
  for (const record of s.projects) record.summary.shelfPosition += 1;
  const pageId = newId();
  const setId = newId();
  const record: ProjectRecord = {
    summary: {
      id: newId(),
      title: source.title,
      status: 'building',
      posted: false,
      coverThumbUrl: null,
      lastEditedAt: now(),
      shelfPosition: 0,
      kind: 'derive',
    },
    derivedFrom: structuredClone(source.derivedFrom),
    pages: [{ id: pageId, index: 0 }],
    sets: [
      {
        id: setId,
        pageId,
        position: 1,
        prompt: source.prompt,
        answers: [
          {
            ...structuredClone(source.answer),
            id: newId(),
            setId,
            number: 1,
            pinned: false,
            status: 'accepted',
            origin: 'derived_copy',
            baseAnswerId: null,
            createdAt: now(),
          },
        ],
      },
    ],
  };
  s.projects.push(record);
  return { project: { ...record.summary } };
}

// ---- 완료·게시(서버 #33 전 가짜) ----

/** 버려지지 않은 답변 전부(세트 순서대로). */
function answersOf(record: ProjectRecord): Answer[] {
  return [...record.sets]
    .sort((a, b) => a.pageId.localeCompare(b.pageId) || a.position - b.position)
    .flatMap((set) => set.answers)
    .filter((answer) => answer.status === 'accepted');
}

/** 완료 후보: 핀 꽂은 답변. 핀이 하나도 없으면 전부. */
export function finishCandidatesOf(s: FakeStore, id: string): FinishCandidatesResponse {
  const answers = answersOf(projectOf(s, id));
  const pinned = answers.filter((answer) => answer.pinned);
  return { answers: (pinned.length > 0 ? pinned : answers).map(toAnswerSummary) };
}

/** 완료: 제목·대표 버전을 저장하고 finished 로 바꾼다. 답변이 없으면 NOT_FINISHABLE. */
export function finishProject(
  s: FakeStore,
  id: string,
  body: FinishProjectRequest,
): FinishProjectResponse {
  const record = projectOf(s, id);
  const answers = answersOf(record);
  if (answers.length === 0) throw new FakeFailure('NOT_FINISHABLE');
  const cover = answers.find((answer) => answer.id === body.coverAnswerId);
  if (!cover) throw new FakeFailure('VALIDATION_FAILED');
  record.summary.title = body.title.trim();
  record.summary.status = 'finished';
  record.summary.coverThumbUrl = cover.thumbUrl;
  record.summary.lastEditedAt = now();
  return { project: { ...record.summary } };
}

/** 게시 켜고 끄기. 완료 전이면 NOT_FINISHED. 같은 값을 다시 보내도 결과가 같다. */
export function postProject(
  s: FakeStore,
  id: string,
  body: PostProjectRequest,
): PostProjectResponse {
  const record = projectOf(s, id);
  // 서버 setPosted 와 같다: 켜기만 완료된 프로젝트가 필요하고, 이미 같은 상태면 예전 시각을 그대로 돌려준다.
  if (body.posted && record.summary.status !== 'finished') throw new FakeFailure('NOT_FINISHED');
  if (body.posted === record.summary.posted) return { postedAt: record.postedAt ?? null };
  record.postedAt = body.posted ? now() : null;
  record.summary.posted = body.posted;
  return { postedAt: record.postedAt };
}

// ---- 워크스페이스·페이지·세트 ----

/** pageId 를 생략하면 마지막 페이지(index 가 가장 큰 것)를 연다(서버와 같다). */
export function workspaceOf(s: FakeStore, id: string, pageId?: string): WorkspaceResponse {
  const record = projectOf(s, id);
  const current =
    pageId === undefined
      ? record.pages[record.pages.length - 1]
      : record.pages.find((page) => page.id === pageId);
  if (!current) throw new FakeFailure('NOT_FOUND');
  const response: WorkspaceResponse = {
    project: { ...record.summary },
    pages: record.pages.map((page) => ({
      id: page.id,
      index: page.index,
      setCount: record.sets.filter((set) => set.pageId === page.id).length,
    })),
    currentPageId: current.id,
    sets: record.sets
      .filter((set) => set.pageId === current.id)
      .sort((a, b) => a.position - b.position)
      .map(toPromptSet),
  };
  const active = activeJobOf(s, id);
  if (active) response.activeJob = toJob(active);
  if (record.summary.kind === 'derive' && record.derivedFrom) {
    response.derivedFrom = structuredClone(record.derivedFrom);
  }
  return response;
}

export function createPage(s: FakeStore, id: string): CreatePageResponse {
  const record = projectOf(s, id);
  if (record.pages.length >= LIMITS.PAGES_MAX) throw new FakeFailure('PAGE_LIMIT_REACHED');
  const page: PageRecord = { id: newId(), index: record.pages.length };
  record.pages.push(page);
  return { page: { ...page } };
}

export function createSet(
  s: FakeStore,
  id: string,
  body: CreateSetRequest,
  options: FakeGenerationOptions = NO_OPTIONS,
): CreateSetResponse {
  const record = projectOf(s, id);
  if (!record.pages.some((page) => page.id === body.pageId)) throw new FakeFailure('NOT_FOUND');
  if (body.attachmentId !== undefined) throw new FakeFailure('VALIDATION_FAILED');
  if (activeJobOf(s, id)) throw new FakeFailure('GENERATION_IN_PROGRESS');
  const onPage = record.sets.filter((set) => set.pageId === body.pageId).length;
  if (onPage >= LIMITS.SETS_PER_PAGE) throw new FakeFailure('SET_LIMIT_REACHED');
  assertWithinLimitsOrSample(options, body.presetKey, body.prompt);
  return addSet(s, record, body.pageId, body.prompt, body.presetKey);
}

function addSet(
  s: FakeStore,
  record: ProjectRecord,
  pageId: string,
  prompt: string,
  presetKey: string | undefined,
): CreateSetResponse {
  const set: SetRecord = {
    id: newId(),
    pageId,
    position: record.sets.filter((other) => other.pageId === pageId).length + 1,
    prompt,
    ...(presetKey === undefined ? {} : { presetKey }),
    answers: [],
  };
  record.sets.push(set);
  const job: JobRecord = {
    id: newId(),
    projectId: record.summary.id,
    setId: set.id,
    pageId,
    status: 'pending',
    startStage: 'analyze',
    nextStage: 'analyze',
    steps: [],
  };
  s.jobs.push(job);
  record.summary.lastEditedAt = now();
  return { set: toPromptSet(set), job: toJob(job) };
}

function setLocation(s: FakeStore, setId: string) {
  for (const project of shelf(s)) {
    const set = project.sets.find((candidate) => candidate.id === setId);
    if (set) return { project, set };
  }
  throw new FakeFailure('NOT_FOUND');
}

function setAnswerState(
  s: FakeStore,
  answer: Answer,
  status: Answer['status'],
  number = answer.number,
): void {
  answer.status = status;
  answer.number = number;
  for (const job of s.jobs) {
    for (const step of job.steps) {
      if (step.answer?.id === answer.id) {
        step.answer.status = status;
        step.answer.number = number;
      }
    }
  }
}

export function createRevision(
  s: FakeStore,
  setId: string,
  body: CreateRevisionRequest,
  options: FakeGenerationOptions = NO_OPTIONS,
): CreateRevisionResponse {
  const { project, set } = setLocation(s, setId);
  const base = set.answers.find((answer) => answer.id === body.baseAnswerId);
  if (!base) throw new FakeFailure('NOT_FOUND');
  if (base.status !== 'accepted') throw new FakeFailure('VALIDATION_FAILED');
  const plan = fakeRevisionPlan(base.nodes, body.nodes);
  // 서버 RemixApplyService.assertApplicable: 실은 Connection 은 모두 이 답변·지금 상대의 것이어야 한다(#151)
  const applied = [...new Set(body.appliedConnectionIds ?? [])];
  const partnerId = project.summary.remixPartner?.id;
  if (
    applied.length > 0 &&
    (partnerId === undefined ||
      !applied.every((id) =>
        (s.connections ?? []).some(
          (c) => c.id === id && c.answerId === base.id && c.partnerId === partnerId,
        ),
      ))
  ) {
    throw new FakeFailure('VALIDATION_FAILED', {
      fields: [
        {
          path: 'appliedConnectionIds',
          message: 'Use connections shown for this answer and the current partner.',
        },
      ],
    });
  }
  const limit = limitCode(options);
  if (limit) throw new FakeFailure(limit);
  const active = s.jobs.filter(
    (job) => job.projectId === project.summary.id && ACTIVE_STATUSES.includes(job.status),
  );
  if (active.some((job) => job.setId !== setId || !job.revision))
    throw new FakeFailure('GENERATION_IN_PROGRESS');
  for (const job of active) job.status = 'cancelled';
  const job: JobRecord = {
    id: newId(),
    projectId: project.summary.id,
    setId,
    pageId: set.pageId,
    status: 'pending',
    startStage: plan.startStage,
    nextStage: plan.startStage,
    steps: [],
    revision: {
      baseAnswerId: base.id,
      nodes: structuredClone(body.nodes),
      ...(applied.length > 0 ? { appliedConnectionIds: applied } : {}),
    },
  };
  s.jobs.push(job);
  return { job: toJob(job), ...plan };
}

export function acceptAnswer(s: FakeStore, answerId: string): AcceptAnswerResponse {
  for (const project of shelf(s)) {
    for (const set of project.sets) {
      const answer = set.answers.find((candidate) => candidate.id === answerId);
      if (!answer) continue;
      if (answer.status !== 'draft') throw new FakeFailure('NOT_DRAFT');
      const number =
        Math.max(
          0,
          ...set.answers
            .filter((candidate) => candidate.status === 'accepted')
            .map((candidate) => candidate.number ?? 0),
        ) + 1;
      setAnswerState(s, answer, 'accepted', number);
      // 서버 RemixApplyService.applyOnAccept: 이 초안을 만든 revise 가 실은 Connection 을 applied 로 바꾼다(#151)
      const job = s.jobs.find((entry) => entry.steps.some((step) => step.answer?.id === answer.id));
      for (const id of job?.revision?.appliedConnectionIds ?? []) {
        const record = (s.connections ?? []).find((c) => c.id === id);
        if (record !== undefined && record.status !== 'applied') record.status = 'applied';
      }
      project.summary.lastEditedAt = now();
      return { answer: { id: answer.id, number, status: 'accepted' } };
    }
  }
  throw new FakeFailure('NOT_FOUND');
}

// ---- 단계 진행(job) ----

/**
 * 서버 advance 와 같은 규칙으로 한 단계를 진행한다.
 * 이미 끝난 단계는 저장된 결과를 그대로 돌려주고, 끝난 job 은 JOB_CLOSED, 순서가 틀리면 STAGE_OUT_OF_ORDER 다.
 */
export function advanceJob(
  s: FakeStore,
  jobId: string,
  stage: JobStage,
  options: FakeGenerationOptions = NO_OPTIONS,
): AdvanceJobResponse {
  const job = jobOf(s, jobId);
  if (job.status === 'cancelled') throw new FakeFailure('JOB_CLOSED');
  const done = job.steps.find((step) => step.stage === stage && step.status === 'succeeded');
  if (done) return { job: toJob(job), step: done };
  if (!ACTIVE_STATUSES.includes(job.status)) throw new FakeFailure('JOB_CLOSED');
  if (stage !== job.nextStage) {
    throw new FakeFailure('STAGE_OUT_OF_ORDER', { expected: job.nextStage });
  }
  const set = projectOf(s, job.projectId).sets.find((candidate) => candidate.id === job.setId);
  if (!set) throw new FakeFailure('NOT_FOUND');
  // AI 를 부르는 단계 전에 상한·AI 실패(?fakeSample=1)를 본다. 프리셋 문장 그대로면 대체 결과로 채운다(서버와 같다).
  if (job.revision && (isTextStage(stage) || stage === 'image')) {
    const limit = limitCode(options);
    if (limit) throw new FakeFailure(limit);
  }
  if (!job.revision && job.sample !== true && (isTextStage(stage) || stage === 'image')) {
    const limit = limitCode(options);
    if (limit !== null || options.sample) {
      if (matchPreset(set.presetKey, set.prompt) !== null) job.sample = true;
      else if (limit !== null) throw new FakeFailure(limit);
    }
  }

  const step = runStage(s, job, set, stage);
  job.steps.push(step);
  job.nextStage = nextStageOf(stage);
  job.status = job.nextStage === null ? 'succeeded' : 'running';
  return { job: toJob(job), step };
}

/** 텍스트 단계(analyze~draft)에서 나온 노드를 모은다. */
function textNodes(job: JobRecord): Node[] {
  const earlier =
    job.revision?.nodes.nodes.filter(
      (node) =>
        isTextStage(node.stage) &&
        FAKE_STAGE_ORDER.indexOf(node.stage) < FAKE_STAGE_ORDER.indexOf(job.startStage),
    ) ?? [];
  return [
    ...earlier,
    ...job.steps.flatMap((step) => (isTextStage(step.stage) ? (step.nodes ?? []) : [])),
  ];
}

function runStage(s: FakeStore, job: JobRecord, set: SetRecord, stage: JobStage): JobStep {
  const base = { stage, status: 'succeeded' as const, fallbackUsed: false };
  const provider = job.sample === true ? 'sample' : 'mock';
  if (isTextStage(stage)) return { ...base, provider, nodes: fakeNodes(stage) };
  if (stage === 'assemble') return { ...base, provider: null };
  if (stage === 'image') {
    const id = newId();
    const sample = job.sample === true;
    const answer: Answer = {
      id,
      // 대체 결과는 번호가 없고(서버와 같다) origin 이 sample 이다
      number:
        sample || job.revision
          ? null
          : Math.max(
              0,
              ...set.answers.filter((a) => a.status === 'accepted').map((a) => a.number ?? 0),
            ) + 1,
      pinned: false,
      isSample: sample,
      thumbUrl: FAKE_IMAGE_URL,
      createdAt: now(),
      setId: set.id,
      status: job.revision ? 'draft' : 'accepted',
      origin: job.revision ? 'edited' : sample ? 'sample' : 'generated',
      imageMode: job.revision ? 'edit' : 'generate',
      baseAnswerId: job.revision?.baseAnswerId ?? null,
      imageUrl: FAKE_IMAGE_URL,
      nodes: {
        ...fakeSnapshot(textNodes(job)),
        subjectTemplate: job.revision?.nodes.subjectTemplate ?? fakeSnapshot([]).subjectTemplate,
      },
      verification: null,
    };
    if (job.revision) {
      for (const previous of set.answers.filter((entry) => entry.status === 'draft'))
        setAnswerState(s, previous, 'discarded');
    }
    set.answers.push(answer);
    return { ...base, provider, answer };
  }
  // verify: 검증 기준을 만들고, 방금 만든 답변에도 붙인다.
  const verification = fakeVerification(textNodes(job));
  const latest = set.answers[set.answers.length - 1];
  if (latest) latest.verification = verification;
  return { ...base, provider: null, verification };
}

export function getJob(s: FakeStore, jobId: string): GetJobResponse {
  const job = jobOf(s, jobId);
  return { job: toJob(job), steps: [...job.steps] };
}

/** 진행 중일 때만 취소한다. 이미 끝난(succeeded·failed) job 은 JOB_CLOSED. */
export function cancelJob(s: FakeStore, jobId: string): CancelJobResponse {
  const job = jobOf(s, jobId);
  if (job.status === 'succeeded' || job.status === 'failed') throw new FakeFailure('JOB_CLOSED');
  job.status = 'cancelled';
  return { job: toJob(job) };
}

// ---- 리믹스 상대(fake/remix.ts 가 규칙을 보고 부른다) ----

/** 내 프로젝트의 리믹스 상대를 바꾼다. null 이면 해제. 없는 프로젝트는 NOT_FOUND. */
export function setProjectRemixPartner(
  s: FakeStore,
  projectId: string,
  partner: ProjectSummary['remixPartner'] | null,
): void {
  const record = projectOf(s, projectId);
  if (partner === null || partner === undefined) delete record.summary.remixPartner;
  else record.summary.remixPartner = { ...partner };
}

/**
 * 답변이 속한 내 프로젝트와 그 답변의 노드 id. 지운 프로젝트나 없는 답변이면 null.
 * Connection 가짜 응답(fake/remix.ts)이 쓴다.
 */
export function answerOwnerOf(
  s: FakeStore,
  answerId: string,
): { projectId: string; partnerId: string | undefined; nodeIds: string[] } | null {
  for (const record of s.projects) {
    if (record.deleted === true) continue;
    for (const set of record.sets) {
      const answer = set.answers.find((candidate) => candidate.id === answerId);
      if (answer === undefined) continue;
      return {
        projectId: record.summary.id,
        partnerId: record.summary.remixPartner?.id,
        nodeIds: answer.nodes.nodes
          .filter((node) => node.enabled && node.stage !== 'verify')
          .map((node) => node.id),
      };
    }
  }
  return null;
}

/** 내 답변만 찾는다. 공개 답변 fixture 조회는 가짜 라우트에서 처리한다. */
export function getAnswer(s: FakeStore, answerId: string): GetAnswerResponse {
  for (const project of s.projects) {
    if (project.deleted === true) continue;
    for (const set of project.sets) {
      const answer = set.answers.find((entry) => entry.id === answerId);
      if (answer) return { answer };
    }
  }
  throw new FakeFailure('NOT_FOUND');
}

export function pinAnswer(s: FakeStore, answerId: string, pinned: boolean): PinAnswerResponse {
  const { answer } = getAnswer(s, answerId);
  if (answer.status !== 'accepted') throw new FakeFailure('VALIDATION_FAILED');
  answer.pinned = pinned;
  for (const job of s.jobs) {
    for (const step of job.steps) {
      if (step.answer?.id === answerId) step.answer.pinned = pinned;
    }
  }
  return { pinned };
}

function toNodeComment(record: NodeComment): NodeComment {
  const { id, nodeId, author, body, createdAt } = record;
  return { id, nodeId, author, body, createdAt, mine: author.id === FAKE_CREATOR.id };
}

export function listNodeComments(s: FakeStore, answer: Answer): NodeCommentListResponse {
  return {
    comments: (s.nodeComments ?? [])
      .filter((entry) => entry.answerId === answer.id && entry.deleted !== true)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map(toNodeComment),
  };
}

export function createNodeComment(
  s: FakeStore,
  answer: Answer,
  body: CreateNodeCommentRequest,
): CreateNodeCommentResponse {
  const ids = answer.nodes.nodes.map((node) => node.id);
  if (!ids.includes(body.nodeId)) throw new FakeFailure('VALIDATION_FAILED');
  const record = {
    id: newId(),
    answerId: answer.id,
    nodeId: body.nodeId,
    author: { ...FAKE_CREATOR },
    body: body.body,
    createdAt: now(),
    mine: true,
  };
  (s.nodeComments ??= []).push(record);
  return { comment: toNodeComment(record) };
}

export function deleteNodeComment(
  s: FakeStore,
  commentId: string,
  requireReadable: (answerId: string) => void,
): void {
  const record = s.nodeComments?.find((entry) => entry.id === commentId);
  if (!record || record.deleted === true) throw new FakeFailure('NOT_FOUND');
  if (record.author.id !== FAKE_CREATOR.id) {
    requireReadable(record.answerId);
    throw new FakeFailure('FORBIDDEN');
  }
  record.deleted = true;
}

export function updateVerification(
  s: FakeStore,
  answerId: string,
  body: UpdateVerificationRequest,
): UpdateVerificationResponse {
  const { answer } = getAnswer(s, answerId);
  if (answer.verification === null) throw new FakeFailure('VALIDATION_FAILED');
  const verification = structuredClone(answer.verification);
  const targets = [...verification.criteria, ...verification.mismatches];
  for (const change of body.nodes) {
    const node = targets.find((entry) => entry.id === change.id);
    if (!node) throw new FakeFailure('VALIDATION_FAILED');
    node.enabled = change.enabled ?? change.decision === 'kept';
  }
  answer.verification = verification;
  for (const job of s.jobs) {
    for (const step of job.steps) {
      if (step.answer?.id === answerId) step.answer.verification = structuredClone(verification);
    }
  }
  return { verification };
}
