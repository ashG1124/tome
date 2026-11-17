import { BUSY_MARK_DELAY_MS, useShowAfter } from './busy';

/**
 * 버튼 글자 옆의 작은 원형 처리 중 표시. busy 가 300ms 넘게 이어질 때만 보인다(빨리 끝나면 깜빡이지 않게).
 * 장식이라 aria-hidden 이고, 처리 중이라는 사실은 버튼의 aria-busy 가 알린다.
 * 움직임 줄이기 설정이면 돌지 않는다.
 */
export function BusyMark({ busy }: { busy: boolean }) {
  const shown = useShowAfter(busy, BUSY_MARK_DELAY_MS);
  if (!shown) return null;
  return (
    <span
      aria-hidden="true"
      data-busy-mark=""
      className={[
        'inline-block size-[var(--size-icon-state)] rounded-[var(--radius-max)]',
        'border-[length:var(--stroke-weight-bold)] border-solid border-current border-t-transparent',
        'animate-spin motion-reduce:animate-none',
      ].join(' ')}
    />
  );
}
