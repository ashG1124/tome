import {
  LIMITS,
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
} from '@tome/shared';
import { FAKE_PAGE_IDS, FAKE_PROJECTS } from './data';
import { FakeFailure } from './errors';
import {
  FAKE_IMAGE_URL,
  fakeNodes,
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
  answers: Answer[];
}

interface ProjectRecord {
  summary: ProjectSummary;
  /** 지운 프로젝트(소프트 삭제). 목록·조회에서 빠진다. */
  deleted?: boolean;
  pages: PageRecord[];
  sets: SetRecord[];
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
}

/** 성공한 멱등 요청의 기록. 같은 키 + 같은 요청이면 처음 응답을 그대로 돌려준다. */
export interface IdempotencyRecord {
  /** 메서드·경로·본문을 이은 값. 같은 키로 다른 요청이 오면 IDEMPOTENCY_KEY_REUSED */
  request: string;
  status: number;
  body: unknown;
}

export interface FakeStore {
  projects: ProjectRecord[];
  jobs: JobRecord[];
  idempotency: Record<string, IdempotencyRecord>;
}

let store: FakeStore | null = null;

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
  if (store === null) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // 저장소를 쓸 수 없으면 메모리에서만 유지한다.
  }
}

/**
 * 처음 쓸 때 저장해 둔 데이터를, 없으면 고정 데이터를 쓴다.
 * emptyProjects(주소의 ?fakeProjects=empty)면 저장해 둔 데이터가 있어도 빈 서가로 새로 시작한다.
 */
export function fakeStore(emptyProjects: boolean): FakeStore {
  store ??= emptyProjects ? seed(true) : (load() ?? seed(false));
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
  return {
    id: set.id,
    position: set.position,
    prompt: set.prompt,
    latestAnswer: set.answers[set.answers.length - 1] ?? null,
    answers: set.answers.map(toAnswerSummary),
  };
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
export function createProject(s: FakeStore, body: CreateProjectRequest): CreateProjectResponse {
  // 첨부는 첨부 단계(T11) 전까지 서버도 400 이다. 리믹스 상대(remixPartnerId)는 리믹스 단계에서 다룬다.
  if (body.attachmentId !== undefined) throw new FakeFailure('VALIDATION_FAILED');
  const prompt = resolvePrompt(body);
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
    },
    pages: [{ id: newId(), index: 0 }],
    sets: [],
  };
  s.projects.push(record);
  const firstPage = record.pages[0];
  if (prompt === undefined || firstPage === undefined) return { project: { ...record.summary } };
  const { set, job } = addSet(s, record, firstPage.id, prompt);
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

// ---- 완료·게시(서버 #33 전 가짜) ----

/** 버려지지 않은 답변 전부(세트 순서대로). */
function answersOf(record: ProjectRecord): Answer[] {
  return [...record.sets]
    .sort((a, b) => a.pageId.localeCompare(b.pageId) || a.position - b.position)
    .flatMap((set) => set.answers)
    .filter((answer) => answer.status !== 'discarded');
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
  if (record.summary.status !== 'finished') throw new FakeFailure('NOT_FINISHED');
  record.summary.posted = body.posted;
  return { postedAt: body.posted ? now() : null };
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
  return response;
}

export function createPage(s: FakeStore, id: string): CreatePageResponse {
  const record = projectOf(s, id);
  if (record.pages.length >= LIMITS.PAGES_MAX) throw new FakeFailure('PAGE_LIMIT_REACHED');
  const page: PageRecord = { id: newId(), index: record.pages.length };
  record.pages.push(page);
  return { page: { ...page } };
}

export function createSet(s: FakeStore, id: string, body: CreateSetRequest): CreateSetResponse {
  const record = projectOf(s, id);
  if (!record.pages.some((page) => page.id === body.pageId)) throw new FakeFailure('NOT_FOUND');
  if (body.attachmentId !== undefined) throw new FakeFailure('VALIDATION_FAILED');
  if (activeJobOf(s, id)) throw new FakeFailure('GENERATION_IN_PROGRESS');
  const onPage = record.sets.filter((set) => set.pageId === body.pageId).length;
  if (onPage >= LIMITS.SETS_PER_PAGE) throw new FakeFailure('SET_LIMIT_REACHED');
  return addSet(s, record, body.pageId, body.prompt);
}

function addSet(
  s: FakeStore,
  record: ProjectRecord,
  pageId: string,
  prompt: string,
): CreateSetResponse {
  const set: SetRecord = {
    id: newId(),
    pageId,
    position: record.sets.filter((other) => other.pageId === pageId).length + 1,
    prompt,
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

// ---- 단계 진행(job) ----

/**
 * 서버 advance 와 같은 규칙으로 한 단계를 진행한다.
 * 이미 끝난 단계는 저장된 결과를 그대로 돌려주고, 끝난 job 은 JOB_CLOSED, 순서가 틀리면 STAGE_OUT_OF_ORDER 다.
 */
export function advanceJob(s: FakeStore, jobId: string, stage: JobStage): AdvanceJobResponse {
  const job = jobOf(s, jobId);
  const done = job.steps.find((step) => step.stage === stage && step.status === 'succeeded');
  if (done) return { job: toJob(job), step: done };
  if (!ACTIVE_STATUSES.includes(job.status)) throw new FakeFailure('JOB_CLOSED');
  if (stage !== job.nextStage) throw new FakeFailure('STAGE_OUT_OF_ORDER');
  const set = projectOf(s, job.projectId).sets.find((candidate) => candidate.id === job.setId);
  if (!set) throw new FakeFailure('NOT_FOUND');

  const step = runStage(job, set, stage);
  job.steps.push(step);
  job.nextStage = nextStageOf(stage);
  job.status = job.nextStage === null ? 'succeeded' : 'running';
  return { job: toJob(job), step };
}

/** 텍스트 단계(analyze~draft)에서 나온 노드를 모은다. */
function textNodes(job: JobRecord): Node[] {
  return job.steps.flatMap((step) => (isTextStage(step.stage) ? (step.nodes ?? []) : []));
}

function runStage(job: JobRecord, set: SetRecord, stage: JobStage): JobStep {
  const base = { stage, status: 'succeeded' as const, fallbackUsed: false };
  if (isTextStage(stage)) return { ...base, provider: 'mock', nodes: fakeNodes(stage) };
  if (stage === 'assemble') return { ...base, provider: null };
  if (stage === 'image') {
    const id = newId();
    const answer: Answer = {
      id,
      number: set.answers.length + 1,
      pinned: false,
      isSample: false,
      thumbUrl: FAKE_IMAGE_URL,
      createdAt: now(),
      setId: set.id,
      status: 'accepted',
      origin: 'generated',
      imageMode: 'generate',
      baseAnswerId: null,
      imageUrl: FAKE_IMAGE_URL,
      nodes: fakeSnapshot(textNodes(job)),
      verification: null,
    };
    set.answers.push(answer);
    return { ...base, provider: 'mock', answer };
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
