import { apiConfig } from './config';
import { api } from './endpoints';
import { resetFake } from './fake/state';
import { clearSession, useSessionStore } from './session';

/** 이 앱이 브라우저 저장소에 두는 값은 모두 이 접두어로 시작한다(토큰·동의·캔버스 자리·홈 배치·가짜 서버 데이터). */
export const STORAGE_PREFIX = 'tome.';

/** 서버가 잠들어 있어도 초기화가 오래 걸리지 않도록, 세션 끝내기 응답은 이만큼만 기다린다(ms). */
export const END_SESSION_WAIT_MS = 3000;

/** 저장소에서 STORAGE_PREFIX 로 시작하는 값만 지운다. 다른 값은 그대로 둔다. 지운 개수를 돌려준다. */
export function clearPrefixedStorage(storage: Storage | undefined): number {
  if (storage === undefined) return 0;
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
    return keys.length;
  } catch {
    // 저장소를 쓸 수 없으면 지울 것도 없다.
    return 0;
  }
}

function browserStorage(name: 'localStorage' | 'sessionStorage'): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window[name];
  } catch {
    return undefined;
  }
}

interface ResetOptions {
  /** 서버 데이터 캐시(TanStack Query). 지난 관람객의 응답이 다음 사람에게 보이지 않게 비운다. */
  queryClient: { clear(): void };
  /** 세션 끝내기 응답을 기다리는 최대 시간(ms). 기본 END_SESSION_WAIT_MS */
  waitMs?: number;
}

/**
 * 이 브라우저의 TÓME 세션을 처음 상태로 되돌린다(전시 운영자용 초기화, #251).
 * 1) 토큰이 있으면 서버에 세션 끝내기(DELETE /session)를 보낸다 — 실패하거나 늦어도 무시하고 넘어간다.
 * 2) localStorage·sessionStorage 에서 tome. 값만 지운다. 3) 세션 스토어를 비운다.
 * 4) 가짜 응답 모드면 가짜 서버의 메모리(동의·데이터)도 처음으로 돌린다. 5) 서버 데이터 캐시를 비운다.
 */
export async function resetBrowserSession({
  queryClient,
  waitMs = END_SESSION_WAIT_MS,
}: ResetOptions): Promise<void> {
  if (useSessionStore.getState().token !== null) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, waitMs);
    });
    const ended = api.endSession().then(
      () => undefined,
      () => undefined,
    );
    await Promise.race([ended, timeout]);
    clearTimeout(timer);
  }

  clearPrefixedStorage(browserStorage('localStorage'));
  clearPrefixedStorage(browserStorage('sessionStorage'));
  clearSession();
  if (apiConfig.mode === 'fake') resetFake();
  queryClient.clear();
}
