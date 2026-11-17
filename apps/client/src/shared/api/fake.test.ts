import {
  CreateSessionResponseSchema,
  ErrorCodeSchema,
  HealthResponseSchema,
  IdempotencyKeySchema,
  MeResponseSchema,
  ProjectListResponseSchema,
  WorkspaceResponseSchema,
} from '@tome/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildHeaders } from './client';
import { readApiConfig } from './config';
import { api } from './endpoints';
import { ApiRequestError, NetworkError } from './errors';
import { ERROR_HTTP } from './fake/errors';
import { resetFake } from './fake/state';
import { liveTransport } from './live';
import { clearSession, setSession, useSessionStore } from './session';

async function signIn({ consent }: { consent: boolean }) {
  const session = await api.createSession('any-code');
  setSession(session.token, session.noticeVersion);
  if (consent) await api.consent(session.noticeVersion);
  return session;
}

async function rejection(promise: Promise<unknown>): Promise<ApiRequestError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    return error as ApiRequestError;
  }
  throw new Error('요청이 성공했다');
}

beforeEach(() => {
  localStorage.clear();
  clearSession();
  resetFake();
});

describe('가짜 응답 모드', () => {
  it('POST /session 은 계약 모양이고 동의 전이면 consentRequired 다', async () => {
    const session = await api.createSession('any-code');
    expect(CreateSessionResponseSchema.safeParse(session).success).toBe(true);
    expect(session.consentRequired).toBe(true);
  });

  it('GET /me 응답이 스키마를 통과한다', async () => {
    await signIn({ consent: false });
    const me = await api.getMe();
    expect(MeResponseSchema.safeParse(me).success).toBe(true);
    expect(me.consented).toBe(false);
  });

  it('동의 후 GET /projects 와 GET /projects/:id/workspace 가 스키마를 통과한다', async () => {
    await signIn({ consent: true });
    const list = await api.listProjects();
    expect(ProjectListResponseSchema.safeParse(list).success).toBe(true);
    expect(list.projects.length).toBeGreaterThan(0);

    const first = list.projects[0];
    expect(first).toBeDefined();
    const workspace = await api.getWorkspace(first!.id);
    expect(WorkspaceResponseSchema.safeParse(workspace).success).toBe(true);
    expect(workspace.project.id).toBe(first!.id);
    expect(workspace.pages.length).toBeGreaterThan(0);
  });

  it('GET /health 는 토큰 없이 부를 수 있다', async () => {
    const health = await api.health();
    expect(HealthResponseSchema.safeParse(health).success).toBe(true);
  });

  it('?fakeProjects=empty 이면 서가가 비어 있다', async () => {
    resetFake('?fakeProjects=empty');
    await signIn({ consent: true });
    expect((await api.listProjects()).projects).toEqual([]);
  });

  it('토큰이 없으면 401 UNAUTHENTICATED 다', async () => {
    const error = await rejection(api.getMe());
    expect(error.code).toBe('UNAUTHENTICATED');
    expect(error.status).toBe(401);
  });

  it('동의 전 GET /projects 는 403 CONSENT_REQUIRED 다', async () => {
    await signIn({ consent: false });
    const error = await rejection(api.listProjects());
    expect(error.code).toBe('CONSENT_REQUIRED');
    expect(error.status).toBe(403);
  });

  it('없는 프로젝트의 workspace 는 404 NOT_FOUND 다', async () => {
    await signIn({ consent: true });
    const error = await rejection(api.getWorkspace('00000000-0000-4000-8000-000000000000'));
    expect(error.code).toBe('NOT_FOUND');
    expect(error.status).toBe(404);
  });

  it('UNAUTHENTICATED 응답을 받으면 저장된 세션을 지운다', async () => {
    setSession('stale-token', 'fake-notice-1');
    await rejection(api.getMe());
    expect(useSessionStore.getState().token).toBeNull();
  });
});

describe('오류 흉내 (?fakeError=)', () => {
  it('?fakeError=SET_LIMIT_REACHED 는 다음 요청 하나를 409 로 실패시킨다', async () => {
    resetFake('?fakeError=SET_LIMIT_REACHED');

    const error = await rejection(api.listProjects());
    expect(error.code).toBe('SET_LIMIT_REACHED');
    expect(error.status).toBe(409);
    expect(error.retryable).toBe(false);

    // 한 번만 쓰고 비운다.
    await signIn({ consent: false });
    await expect(api.getMe()).resolves.toBeDefined();
  });

  it('모든 오류 코드가 표의 HTTP 상태로 던져진다', async () => {
    for (const code of ErrorCodeSchema.options) {
      resetFake(`?fakeError=${code}`);
      const error = await rejection(api.health());
      expect(error.code).toBe(code);
      expect(error.status).toBe(ERROR_HTTP[code].status);
      expect(error.retryable).toBe(ERROR_HTTP[code].retryable);
    }
  });

  it('AI_TIMEOUT 은 504 이고 다시 시도할 수 있다', async () => {
    resetFake('?fakeError=AI_TIMEOUT');
    const error = await rejection(api.health());
    expect(error.status).toBe(504);
    expect(error.retryable).toBe(true);
  });

  it('알 수 없는 코드는 무시한다', async () => {
    resetFake('?fakeError=NOT_A_CODE');
    await expect(api.health()).resolves.toBeDefined();
  });
});

describe('요청 만들기', () => {
  it('변경 요청에 쓰는 Idempotency-Key 는 uuid v4 이고 호출마다 새로 만든다', () => {
    const a = buildHeaders({ token: 't', hasBody: true, idempotent: true });
    const b = buildHeaders({ token: 't', hasBody: true, idempotent: true });
    expect(IdempotencyKeySchema.safeParse(a['Idempotency-Key']).success).toBe(true);
    expect(a['Idempotency-Key']).not.toBe(b['Idempotency-Key']);
    expect(a.Authorization).toBe('Bearer t');
  });

  it('멱등 표시가 없으면 Idempotency-Key 를 붙이지 않는다', () => {
    const headers = buildHeaders({ token: null, hasBody: false, idempotent: false });
    expect(headers['Idempotency-Key']).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  });
});

describe('환경변수 읽기', () => {
  it('아무것도 없으면 fake 모드 기본값이다', () => {
    expect(readApiConfig({})).toEqual({
      mode: 'fake',
      baseUrl: '',
      fakeDelayMs: 0,
      fakeError: null,
    });
  });

  it('live 모드와 서버 주소, 지연, 오류 코드를 읽는다', () => {
    expect(
      readApiConfig({
        VITE_API_MODE: 'live',
        VITE_API_BASE_URL: 'https://api.example.test/',
        VITE_FAKE_DELAY_MS: '250',
        VITE_FAKE_ERROR: 'RATE_LIMITED',
      }),
    ).toEqual({
      mode: 'live',
      baseUrl: 'https://api.example.test',
      fakeDelayMs: 250,
      fakeError: 'RATE_LIMITED',
    });
  });
});

describe('live 전송 계층', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('연결 실패는 NetworkError 로 구분한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(
      liveTransport({ method: 'GET', path: '/health', headers: {} }),
    ).rejects.toBeInstanceOf(NetworkError);
  });
});
