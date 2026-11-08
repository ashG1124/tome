import {
  ConsentRequestSchema,
  ConsentResponseSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  HealthResponseSchema,
  MeResponseSchema,
  ProjectListResponseSchema,
  WorkspaceResponseSchema,
} from '@tome/shared';
import type { HttpMethod } from '../transport';
import {
  FAKE_AGREED_AT,
  FAKE_CREATOR,
  FAKE_NOTICE_VERSION,
  FAKE_PROJECTS,
  FAKE_TOKEN,
  fakeHealth,
  fakeWorkspace,
} from './data';
import { FakeFailure } from './errors';
import { fakeState, setFakeConsented } from './state';

interface Parser {
  parse(data: unknown): unknown;
}

interface RouteContext {
  params: Record<string, string>;
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
  handle: (context: RouteContext) => unknown;
}

interface RouteDefinition {
  method: HttpMethod;
  pattern: string;
  response: Parser;
  auth?: boolean;
  requiresConsent?: boolean;
  idempotent?: boolean;
  handle: (context: RouteContext) => unknown;
}

function route(definition: RouteDefinition): FakeRoute {
  return {
    auth: true,
    requiresConsent: true,
    idempotent: false,
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
    handle: () => ({ projects: fakeState.emptyProjects ? [] : [...FAKE_PROJECTS] }),
  }),
  route({
    method: 'GET',
    pattern: '/projects/:id/workspace',
    response: WorkspaceResponseSchema,
    handle: ({ params }) => {
      const workspace = fakeWorkspace(params.id ?? '');
      if (!workspace) throw new FakeFailure('NOT_FOUND');
      return workspace;
    },
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
