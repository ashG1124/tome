import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAKE_NOTICE_VERSION, FAKE_TOKEN } from './fake/data';
import { fakeState, resetFake, setFakeConsented } from './fake/state';
import { api } from './endpoints';
import { clearPrefixedStorage, resetBrowserSession } from './reset';
import { clearSession, setSession, useSessionStore } from './session';

function seedBrowser() {
  setSession(FAKE_TOKEN, FAKE_NOTICE_VERSION);
  setFakeConsented();
  localStorage.setItem('tome.canvas.drag.p1.page1', '{"v":1}');
  localStorage.setItem('tome.home.layout.creator-1', '{"v":1}');
  localStorage.setItem('tome.fake.store.v2', '{}');
  localStorage.setItem('other-app.setting', 'keep');
  localStorage.setItem('tomes', 'keep');
  sessionStorage.setItem('tome.something', 'x');
  sessionStorage.setItem('other-app.tab', 'keep');
}

function tomeKeys(storage: Storage): string[] {
  return Object.keys(storage).filter((key) => key.startsWith('tome.'));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearSession();
  resetFake();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('clearPrefixedStorage', () => {
  it('tome. 으로 시작하는 값만 지우고 나머지는 그대로 둔다', () => {
    seedBrowser();
    // 토큰·공지 버전·가짜 동의·캔버스 자리·홈 배치·가짜 서버 데이터
    expect(clearPrefixedStorage(localStorage)).toBe(6);
    expect(tomeKeys(localStorage)).toEqual([]);
    expect(localStorage.getItem('other-app.setting')).toBe('keep');
    expect(localStorage.getItem('tomes')).toBe('keep');
  });

  it('저장소가 없거나 읽다 실패해도 던지지 않는다', () => {
    expect(clearPrefixedStorage(undefined)).toBe(0);
    const broken = {
      get length(): number {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(clearPrefixedStorage(broken)).toBe(0);
  });
});

describe('resetBrowserSession', () => {
  it('세션 끝내기를 보내고, tome. 값·세션 스토어·서버 데이터 캐시를 비운다', async () => {
    seedBrowser();
    const endSession = vi.spyOn(api, 'endSession');
    const queryClient = { clear: vi.fn() };

    await resetBrowserSession({ queryClient });

    expect(endSession).toHaveBeenCalledTimes(1);
    expect(tomeKeys(localStorage)).toEqual([]);
    expect(tomeKeys(sessionStorage)).toEqual([]);
    expect(localStorage.getItem('other-app.setting')).toBe('keep');
    expect(sessionStorage.getItem('other-app.tab')).toBe('keep');
    expect(useSessionStore.getState()).toEqual({ token: null, noticeVersion: null });
    expect(queryClient.clear).toHaveBeenCalledTimes(1);
    // 가짜 응답 모드: 가짜 서버의 동의 기록도 처음으로 돌아간다
    expect(fakeState.consented).toBe(false);
  });

  it('토큰이 없으면 서버에 보내지 않고 브라우저만 비운다', async () => {
    localStorage.setItem('tome.home.layout.creator-1', '{"v":1}');
    const endSession = vi.spyOn(api, 'endSession');
    const queryClient = { clear: vi.fn() };

    await resetBrowserSession({ queryClient });

    expect(endSession).not.toHaveBeenCalled();
    expect(tomeKeys(localStorage)).toEqual([]);
    expect(queryClient.clear).toHaveBeenCalledTimes(1);
  });

  it('세션 끝내기가 실패해도 초기화를 마친다', async () => {
    seedBrowser();
    vi.spyOn(api, 'endSession').mockRejectedValue(new Error('offline'));
    const queryClient = { clear: vi.fn() };

    await resetBrowserSession({ queryClient });

    expect(tomeKeys(localStorage)).toEqual([]);
    expect(useSessionStore.getState().token).toBeNull();
    expect(queryClient.clear).toHaveBeenCalledTimes(1);
  });

  it('세션 끝내기 응답이 늦으면 기다리지 않고 넘어간다', async () => {
    seedBrowser();
    vi.spyOn(api, 'endSession').mockReturnValue(new Promise<undefined>(() => {}));
    const queryClient = { clear: vi.fn() };

    await resetBrowserSession({ queryClient, waitMs: 10 });

    expect(tomeKeys(localStorage)).toEqual([]);
    expect(queryClient.clear).toHaveBeenCalledTimes(1);
  });

  it('가짜 서버의 DELETE /session 은 204 로 답한다', async () => {
    setSession(FAKE_TOKEN, FAKE_NOTICE_VERSION);
    await expect(api.endSession()).resolves.toBeUndefined();
  });
});
