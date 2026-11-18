import type { CSSProperties } from 'react';

// 무늬 한 칸 = 카드 한 칸 + 칸 사이 틈. 크기는 모두 토큰에서 온다.
const PITCH = `calc(var(--size-shelf-card-width) + var(--grid-gutter)) calc(var(--size-shelf-card-height) + var(--grid-gutter))`;
const MARK = 'var(--size-shelf-grid-mark)';
const HALF = 'calc(var(--size-shelf-grid-mark) / 2)';
const LINE_START = 'calc(var(--size-shelf-grid-mark) / 2 - var(--size-shelf-grid-line) / 2)';
const LINE_END = 'calc(var(--size-shelf-grid-mark) / 2 + var(--size-shelf-grid-line) / 2)';
// 무늬 색. 마스크는 투명도만 보므로 마스크 안에서도 같은 토큰을 "불투명한 칠"로 쓴다.
const INK = 'var(--color-grayscale-3)';

/** 가운데(HALF)가 가장 진하고 양끝(0, MARK)으로 갈수록 옅어지는 띠 */
const fade = (direction: string) =>
  `linear-gradient(${direction}, transparent 0, ${INK} ${HALF}, transparent ${MARK})`;
/** 가운데에 선 굵기만큼만 칠한 띠 */
const line = (direction: string) =>
  `linear-gradient(${direction}, transparent ${LINE_START}, ${INK} ${LINE_START}, ${INK} ${LINE_END}, transparent ${LINE_END})`;

// 아래 층부터 합친다: (가로선 + 세로선) 을 세로 옅어짐, 가로 옅어짐과 겹치는 부분만 남기면
// 가운데가 진하고 끝으로 갈수록 옅어지는 + 무늬가 된다.
const MASK = [fade('to right'), fade('to bottom'), line('to bottom'), line('to right')].join(', ');

const STYLE: CSSProperties = {
  backgroundColor: INK,
  maskImage: MASK,
  WebkitMaskImage: MASK,
  maskComposite: 'intersect, intersect, add, add',
  WebkitMaskComposite: 'source-in, source-in, source-over, source-over',
  maskSize: PITCH,
  WebkitMaskSize: PITCH,
};

/**
 * 홈 서가 뒤에 까는 점선 격자. 카드 칸 사이 틈이 만나는 곳마다 + 무늬가 하나씩 놓인다.
 * 서가 자리보다 (틈 반 칸 + 무늬 반 개)만큼 사방으로 넓게 깐다. 그래야 첫 칸 바깥쪽 틈의
 * 무늬도 잘리지 않고, 무늬 가운데가 틈의 한가운데에 온다(무늬 한 칸의 왼쪽 위 = 이 요소의 왼쪽 위).
 * 장식이라 화면 낭독기에서 숨기고, 마우스도 그대로 통과시킨다.
 */
export function ShelfGrid() {
  return (
    <div
      aria-hidden="true"
      data-shelf-grid=""
      className="pointer-events-none absolute -inset-[calc(var(--grid-gutter)/2_+_var(--size-shelf-grid-mark)/2)] -z-10"
      style={STYLE}
    />
  );
}
