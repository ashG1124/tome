import type { CSSProperties } from 'react';

// 한 칸 = 카드 한 칸 + 칸 사이 틈(가로 128, 세로 212). 크기는 모두 토큰에서 온다.
const PITCH = `calc(var(--size-shelf-card-width) + var(--grid-gutter)) calc(var(--size-shelf-card-height) + var(--grid-gutter))`;
const HALF = 'calc(var(--size-shelf-grid-mark) / 2)';

// Figma 격자 마크(1226:74486)의 십자 모양. 가로 128 × 세로 212 한 칸 안의 왼쪽 위 20×20 자리에만 그려서
// 마스크로 쓴다. 안의 숫자는 그림 좌표라서 CSS 크기가 아니다.
const MARK_TILE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 212' preserveAspectRatio='none'>" +
  "<path d='M13.81 9.19C12.15 9.19 10.81 7.85 10.81 6.19V0H9.19V6.19C9.19 7.85 7.85 9.19 6.19 9.19H0V10.81H6.19C7.85 10.81 9.19 12.15 9.19 13.81V20H10.81V13.81C10.81 12.15 12.15 10.81 13.81 10.81H20V9.19H13.81Z'/></svg>";

const MASK = `url("${MARK_TILE}")`;

const STYLE: CSSProperties = {
  // 마크 한 개마다 가운데(#C5CBD7)에서 바깥(#F6F8FA)으로 퍼지는 방사 그라디언트
  backgroundImage: `radial-gradient(circle ${HALF} at ${HALF} ${HALF}, var(--color-shelf-mark-center), var(--color-shelf-mark-edge))`,
  backgroundSize: PITCH,
  backgroundRepeat: 'repeat',
  maskImage: MASK,
  WebkitMaskImage: MASK,
  maskSize: PITCH,
  WebkitMaskSize: PITCH,
  maskRepeat: 'repeat',
  WebkitMaskRepeat: 'repeat',
};

/**
 * 서가 뒤 격자(홈 Figma 1226:76573, 프로필 Work 4181:34988). 점선 선은 없고, 칸 모서리가 만나는 곳마다 20×20 십자 마크만 놓인다.
 * 이 요소의 왼쪽 위가 첫 마크의 왼쪽 위이고, 마크는 가로 128·세로 212 간격으로 반복된다.
 * 장식이라 화면 낭독기에서 숨기고, 마우스도 그대로 통과시킨다.
 */
export function ShelfGrid() {
  return (
    <div
      aria-hidden="true"
      data-shelf-grid=""
      className="pointer-events-none absolute inset-0 -z-10"
      style={STYLE}
    />
  );
}
