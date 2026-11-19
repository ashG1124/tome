import type { FlashKind } from '../../shared/ui';

/** 플래시를 보여 주는 시간. 기획 문서에 시간이 없어 기본값으로 정했다(PR 에 적음). */
export const FLASH_MS = 3000;

/**
 * 다른 화면이 홈으로 오면서 넘긴 플래시(navigate 의 state.flash)를 읽는다.
 * 워크스페이스에서 돌아오면 'update', 완료 모달을 거치면 'done' 이다. 모르는 값은 무시한다.
 */
export function flashFromState(state: unknown): FlashKind | null {
  if (typeof state !== 'object' || state === null || !('flash' in state)) return null;
  const { flash } = state;
  return flash === 'update' || flash === 'done' ? flash : null;
}
