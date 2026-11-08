import { create } from 'zustand';

const TOKEN_KEY = 'tome.token';
const NOTICE_VERSION_KEY = 'tome.noticeVersion';

interface SessionState {
  token: string | null;
  noticeVersion: string | null;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // 저장소를 쓸 수 없으면 이번 탭 메모리에서만 유지한다.
  }
}

export const useSessionStore = create<SessionState>(() => ({
  token: read(TOKEN_KEY),
  noticeVersion: read(NOTICE_VERSION_KEY),
}));

export function setSession(token: string, noticeVersion: string): void {
  write(TOKEN_KEY, token);
  write(NOTICE_VERSION_KEY, noticeVersion);
  useSessionStore.setState({ token, noticeVersion });
}

export function clearSession(): void {
  write(TOKEN_KEY, null);
  write(NOTICE_VERSION_KEY, null);
  useSessionStore.setState({ token: null, noticeVersion: null });
}

export function hasSession(): boolean {
  return useSessionStore.getState().token !== null;
}
