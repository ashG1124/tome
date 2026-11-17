import {
  AdvanceJobRequestSchema,
  AdvanceJobResponseSchema,
  CancelJobResponseSchema,
  CompareResponseSchema,
  ConsentRequestSchema,
  ConsentResponseSchema,
  CreatePageResponseSchema,
  CreateProjectRequestSchema,
  CreateProjectResponseSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  CreateSetRequestSchema,
  CreateSetResponseSchema,
  CreatorProfileResponseSchema,
  FinishCandidatesResponseSchema,
  FinishProjectRequestSchema,
  FinishProjectResponseSchema,
  GetJobResponseSchema,
  HealthResponseSchema,
  IdentityResponseSchema,
  MeResponseSchema,
  PostProjectRequestSchema,
  PostProjectResponseSchema,
  ProjectListResponseSchema,
  UpdateProjectRequestSchema,
  UpdateProjectResponseSchema,
  WorkspaceResponseSchema,
} from '@tome/shared';
import type { HttpMethod } from '../transport';
import { FAKE_AGREED_AT, FAKE_CREATOR, FAKE_NOTICE_VERSION, FAKE_TOKEN, fakeHealth } from './data';
import { FakeFailure } from './errors';
import { fakeCompare, fakeCreatorProfile, fakeIdentity } from './identity';
import { fakeState, setFakeConsented } from './state';
import {
  advanceJob,
  cancelJob,
  createPage,
  createProject,
  createSet,
  deleteProject,
  fakeStore,
  finishCandidatesOf,
  finishProject,
  getJob,
  listProjects,
  postProject,
  updateProject,
  workspaceOf,
} from './store';

/** 지금 가짜 서버의 데이터(?fakeProjects=empty 면 빈 서가로 시작). */
const store = () => fakeStore(fakeState.emptyProjects);

/** 본문을 스키마로 검사한다. 어긋나면 서버처럼 400 VALIDATION_FAILED 다. */
function parseBody<T>(
  schema: { safeParse(data: unknown): { success: boolean; data?: T } },
  body: unknown,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success || parsed.data === undefined) throw new FakeFailure('VALIDATION_FAILED');
  return parsed.data;
}

interface Parser {
  parse(data: unknown): unknown;
}

interface RouteContext {
  params: Record<string, string>;
  /** 주소의 ?뒤 값(예: pageId) */
  query: URLSearchParams;
  body: unknown;
}

export interface FakeRoute {
  method: HttpMethod;
  /** `:이름` 으로 경로 변수를 쓴다. */
  pattern: string;
  /** 반환 전에 이 스키마로 검사한다. 모양이 어긋나면 던져서 바로 알 수 있다. */
  response: Parser;
  /** false 이면 토큰 없이 부를 수 있다. */
  auth: boolean;
  /** false 이면 동의 전에도 부를 수 있다. */
  requiresConsent: boolean;
  /** true 이면 Idempotency-Key 헤더가 필요하다. */
  idempotent: boolean;
  /** 성공 상태 코드(기본 200). 본문 없는 응답은 204 */
  status: number;
  handle: (context: RouteContext) => unknown;
}

interface RouteDefinition {
  method: HttpMethod;
  pattern: string;
  response: Parser;
  auth?: boolean;
  requiresConsent?: boolean;
  idempotent?: boolean;
  status?: number;
  handle: (context: RouteContext) => unknown;
}

function route(definition: RouteDefinition): FakeRoute {
  return {
    auth: true,
    requiresConsent: true,
    idempotent: false,
    status: 200,
    ...definition,
  };
}

export const FAKE_ROUTES: readonly FakeRoute[] = [
  route({
    method: 'GET',
    pattern: '/health',
    response: HealthResponseSchema,
    auth: false,
    requiresConsent: false,
    handle: () => fakeHealth(),
  }),
  route({
    method: 'POST',
    pattern: '/session',
    response: CreateSessionResponseSchema,
    auth: false,
    requiresConsent: false,
    handle: ({ body }) => {
      if (!CreateSessionRequestSchema.safeParse(body).success) {
        throw new FakeFailure('VALIDATION_FAILED');
      }
      return {
        token: FAKE_TOKEN,
        creator: FAKE_CREATOR,
        consentRequired: !fakeState.consented,
        noticeVersion: FAKE_NOTICE_VERSION,
      };
    },
  }),
  route({
    method: 'POST',
    pattern: '/session/consent',
    response: ConsentResponseSchema,
    requiresConsent: false,
    handle: ({ body }) => {
      const parsed = ConsentRequestSchema.safeParse(body);
      if (!parsed.success) throw new FakeFailure('VALIDATION_FAILED');
      if (parsed.data.noticeVersion !== FAKE_NOTICE_VERSION)
        throw new FakeFailure('NOTICE_OUTDATED');
      setFakeConsented();
      return { agreedAt: FAKE_AGREED_AT };
    },
  }),
  route({
    method: 'GET',
    pattern: '/me',
    response: MeResponseSchema,
    requiresConsent: false,
    handle: () => ({ creator: FAKE_CREATOR, consented: fakeState.consented, limits: {} }),
  }),
  route({
    method: 'GET',
    pattern: '/projects',
    response: ProjectListResponseSchema,
    handle: () => ({ projects: listProjects(store()) }),
  }),
  route({
    method: 'POST',
    pattern: '/projects',
    response: CreateProjectResponseSchema,
    idempotent: true,
    handle: ({ body }) => createProject(store(), parseBody(CreateProjectRequestSchema, body)),
  }),
  route({
    method: 'PATCH',
    pattern: '/projects/:id',
    response: UpdateProjectResponseSchema,
    handle: ({ params, body }) =>
      updateProject(store(), params.id ?? '', parseBody(UpdateProjectRequestSchema, body)),
  }),
  route({
    method: 'DELETE',
    pattern: '/projects/:id',
    // 204: 본문이 없다
    response: { parse: () => undefined },
    status: 204,
    handle: ({ params }) => deleteProject(store(), params.id ?? ''),
  }),
  route({
    method: 'GET',
    pattern: '/projects/:id/workspace',
    response: WorkspaceResponseSchema,
    handle: ({ params, query }) =>
      workspaceOf(store(), params.id ?? '', query.get('pageId') ?? undefined),
  }),
  route({
    method: 'POST',
    pattern: '/projects/:id/pages',
    response: CreatePageResponseSchema,
    idempotent: true,
    handle: ({ params }) => createPage(store(), params.id ?? ''),
  }),
  route({
    method: 'POST',
    pattern: '/projects/:id/sets',
    response: CreateSetResponseSchema,
    idempotent: true,
    handle: ({ params, body }) =>
      createSet(store(), params.id ?? '', parseBody(CreateSetRequestSchema, body)),
  }),
  route({
    method: 'GET',
    pattern: '/projects/:id/finish-candidates',
    response: FinishCandidatesResponseSchema,
    handle: ({ params }) => finishCandidatesOf(store(), params.id ?? ''),
  }),
  route({
    method: 'POST',
    pattern: '/projects/:id/finish',
    response: FinishProjectResponseSchema,
    idempotent: true,
    handle: ({ params, body }) =>
      finishProject(store(), params.id ?? '', parseBody(FinishProjectRequestSchema, body)),
  }),
  route({
    method: 'PUT',
    pattern: '/projects/:id/post',
    response: PostProjectResponseSchema,
    handle: ({ params, body }) =>
      postProject(store(), params.id ?? '', parseBody(PostProjectRequestSchema, body)),
  }),
  route({
    method: 'POST',
    pattern: '/jobs/:jobId/advance',
    response: AdvanceJobResponseSchema,
    handle: ({ params, body }) =>
      advanceJob(store(), params.jobId ?? '', parseBody(AdvanceJobRequestSchema, body).stage),
  }),
  route({
    method: 'GET',
    pattern: '/jobs/:jobId',
    response: GetJobResponseSchema,
    handle: ({ params }) => getJob(store(), params.jobId ?? ''),
  }),
  route({
    method: 'POST',
    pattern: '/jobs/:jobId/cancel',
    response: CancelJobResponseSchema,
    handle: ({ params }) => cancelJob(store(), params.jobId ?? ''),
  }),
  route({
    method: 'GET',
    pattern: '/creators/:id',
    response: CreatorProfileResponseSchema,
    handle: ({ params }) => fakeCreatorProfile(params.id ?? '', fakeState.identityCase),
  }),
  route({
    method: 'GET',
    pattern: '/creators/:id/identity',
    response: IdentityResponseSchema,
    handle: ({ params }) => fakeIdentity(params.id ?? '', fakeState.identityCase),
  }),
  route({
    method: 'GET',
    pattern: '/identity/compare',
    response: CompareResponseSchema,
    handle: () => fakeCompare(fakeState.identityCase),
  }),
];

function compile(pattern: string): RegExp {
  const source = pattern.replace(/:[A-Za-z]+/g, '([^/]+)');
  return new RegExp(`^${source}$`);
}

export function matchRoute(
  method: HttpMethod,
  pathname: string,
): { route: FakeRoute; params: Record<string, string> } | null {
  for (const candidate of FAKE_ROUTES) {
    if (candidate.method !== method) continue;
    const match = compile(candidate.pattern).exec(pathname);
    if (!match) continue;
    const names = [...candidate.pattern.matchAll(/:([A-Za-z]+)/g)].map((m) => m[1] ?? '');
    const params: Record<string, string> = {};
    names.forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1] ?? '');
    });
    return { route: candidate, params };
  }
  return null;
}
