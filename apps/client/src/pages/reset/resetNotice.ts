import { create } from 'zustand';

/**
 * 초기화 뒤 처음 화면에 띄울 "Session reset." 플래시 상태(#251).
 * armed = 초기화를 시작해 role=status 칸을 미리 그려 둔 상태(글이 들어갈 때 보조기기가 읽도록),
 * shown = 글을 보여 주는 중. 레이아웃은 화면을 옮겨도 남아 있어서 /reset → / 사이에도 칸이 유지된다.
 */
export type ResetNoticePhase = 'idle' | 'armed' | 'shown';

export const useResetNotice = create<{ phase: ResetNoticePhase }>(() => ({ phase: 'idle' }));

export function armResetNotice(): void {
  useResetNotice.setState({ phase: 'armed' });
}

export function showResetNotice(): void {
  useResetNotice.setState({ phase: 'shown' });
}

export function hideResetNotice(): void {
  useResetNotice.setState({ phase: 'idle' });
}
