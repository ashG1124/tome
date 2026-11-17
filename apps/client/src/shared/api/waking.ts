import { create } from 'zustand';

/** 첫 요청이 이 시간(ms)을 넘겨도 끝나지 않으면 "서버를 깨우는 중"으로 본다. */
export const SLOW_FIRST_REQUEST_MS = 1000;

interface WakingState {
  /** true 이면 화면 맨 위에 S-05 띠를 띄운다. */
  waking: boolean;
}

export const useWakingStore = create<WakingState>(() => ({ waking: false }));

let watched = false;

/**
 * 앱을 열거나 새로고침한 뒤 첫 요청 하나만 지켜본다.
 * 1초를 넘기면 waking 을 켜고, 끝나면(성공·실패 모두) 끈다. 그 뒤 요청은 그대로 돌려준다.
 */
export function watchFirstRequest<T>(request: Promise<T>): Promise<T> {
  if (watched) return request;
  watched = true;
  const timer = setTimeout(() => useWakingStore.setState({ waking: true }), SLOW_FIRST_REQUEST_MS);
  const done = () => {
    clearTimeout(timer);
    useWakingStore.setState({ waking: false });
  };
  request.then(done, done);
  return request;
}

/** 테스트용: "앱을 막 연" 상태로 되돌린다. */
export function resetFirstRequestWatch(): void {
  watched = false;
  useWakingStore.setState({ waking: false });
}
