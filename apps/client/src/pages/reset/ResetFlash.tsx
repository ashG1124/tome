import { useEffect } from 'react';
import { Flash, FLASH_MS } from '../../shared/ui';
import { hideResetNotice, useResetNotice } from './resetNotice';

/**
 * 초기화를 마친 뒤 처음 화면에 잠깐 뜨는 "Session reset." 알림(role=status).
 * 홈 플래시처럼 화면 위 가운데에 띄운다(랜딩 헤더의 가운데는 비어 있다). 랜딩 헤더(z-index 60)보다 위에 그린다.
 * 초기화 중이 아니면 아무것도 그리지 않아 다른 화면의 role=status 칸 수를 바꾸지 않는다.
 */
export function ResetFlash() {
  const phase = useResetNotice((state) => state.phase);

  useEffect(() => {
    if (phase !== 'shown') return;
    const timer = window.setTimeout(hideResetNotice, FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === 'idle') return null;
  return (
    <div className="pointer-events-none fixed top-[var(--space-padding-8)] left-1/2 z-[70] -translate-x-1/2">
      <Flash kind={phase === 'shown' ? 'reset' : null} />
    </div>
  );
}
