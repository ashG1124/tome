import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppError } from '../../common';
import { AllowBeforeConsent, AUTH_REQUEST_KEY, Public } from './auth.decorators';
import { LoginRateLimiter } from './login-rate-limiter';
import { SessionGuard } from './session.guard';
import type { SessionRepository, SessionRow } from './session.repository';
import { hashToken, SessionService } from './session.service';

const NOW = new Date('2026-11-13T00:00:00Z');

class Routes {
  protectedRoute() {}
  @Public() publicRoute() {}
  @AllowBeforeConsent() beforeConsent() {}
}

function fakeRepo(overrides: Record<string, unknown> = {}) {
  const session: SessionRow = {
    id: 's1',
    creatorId: 'c1',
    lastSeenAt: new Date(NOW.getTime() - 60_000),
  };
  const repo = {
    // 만료·폐기된 세션은 저장소가 걸러서 null 을 준다. 여기서는 알려진 토큰만 살아 있다.
    findLiveSessionByTokenHash: vi.fn(async (hash: string) =>
      hash === hashToken('good') ? session : null,
    ),
    touchSession: vi.fn(async () => {}),
    getNoticeVersion: vi.fn(async () => null),
    hasConsent: vi.fn(async () => true),
    ...overrides,
  };
  return repo as unknown as SessionRepository & typeof repo;
}

function run(repo: SessionRepository, handler: keyof Routes, authorization?: string) {
  const guard = new SessionGuard(new Reflector(), new SessionService(repo, new LoginRateLimiter()));
  const request: Record<string, unknown> = { headers: authorization ? { authorization } : {} };
  const context = {
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { result: guard.canActivate(context), request };
}

const outcome = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (e: unknown) => (e as AppError).code,
  );

describe('SessionGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it.each([undefined, 'Basic abc', 'Bearer', 'Bearer a b', 'bearer good'])(
    'rejects a missing or malformed header (%s)',
    async (header) => {
      expect(await outcome(run(fakeRepo(), 'protectedRoute', header).result)).toBe(
        'UNAUTHENTICATED',
      );
    },
  );

  it('rejects an unknown, expired or revoked token (no live session)', async () => {
    expect(await outcome(run(fakeRepo(), 'protectedRoute', 'Bearer other').result)).toBe(
      'UNAUTHENTICATED',
    );
  });

  it('rejects before consent with CONSENT_REQUIRED', async () => {
    const repo = fakeRepo({ hasConsent: vi.fn(async () => false) });
    expect(await outcome(run(repo, 'protectedRoute', 'Bearer good').result)).toBe(
      'CONSENT_REQUIRED',
    );
    expect(repo.hasConsent).toHaveBeenCalledWith('s1', '1');
  });

  it('passes with consent and attaches the session', async () => {
    const { result, request } = run(fakeRepo(), 'protectedRoute', 'Bearer good');
    expect(await result).toBe(true);
    expect(request[AUTH_REQUEST_KEY]).toEqual({ sessionId: 's1', creatorId: 'c1' });
  });

  it('lets @AllowBeforeConsent through without consent but still needs a token', async () => {
    const repo = fakeRepo({ hasConsent: vi.fn(async () => false) });
    expect(await run(repo, 'beforeConsent', 'Bearer good').result).toBe(true);
    expect(await outcome(run(repo, 'beforeConsent').result)).toBe('UNAUTHENTICATED');
  });

  it('lets @Public through without a token', async () => {
    expect(await run(fakeRepo(), 'publicRoute').result).toBe(true);
  });

  it('refreshes lastSeenAt only after 5 minutes', async () => {
    const repo = fakeRepo();
    await run(repo, 'protectedRoute', 'Bearer good').result;
    expect(repo.touchSession).not.toHaveBeenCalled();

    const stale = fakeRepo({
      findLiveSessionByTokenHash: vi.fn(async () => ({
        id: 's1',
        creatorId: 'c1',
        lastSeenAt: new Date(NOW.getTime() - 5 * 60_000 - 1),
      })),
    });
    await run(stale, 'protectedRoute', 'Bearer good').result;
    expect(stale.touchSession).toHaveBeenCalledWith('s1', NOW);
  });
});
