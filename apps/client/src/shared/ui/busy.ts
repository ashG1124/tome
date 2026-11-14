import { useEffect, useState } from 'react';

/** 이 시간 안에 끝나면 처리 중 표시(원형)를 띄우지 않는다(깜빡임 방지). */
export const BUSY_MARK_DELAY_MS = 300;

/** value 가 delayMs 넘게 true 로 남아 있을 때만 true 가 된다. */
export function useShowAfter(value: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!value) return;
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [value, delayMs]);
  return value && shown;
}
