import type { CSSProperties } from 'react';

/** 마우스를 올린 카드가 넓어질 때 차지하는 칸 수(카드 364px ≈ 108px 칸 3개 + 간격 2개). */
export const OPEN_CARD_SPAN = 3;

/**
 * 서가 한 줄에 들어가는 칸 수. 칸 폭(카드 폭)과 간격으로 계산한다. 최소 1칸.
 * 예: 폭 1680, 칸 108, 간격 20 → (1680 + 20) / 128 = 13칸
 */
export function columnsFor(containerWidth: number, cellWidth: number, gap: number): number {
  if (containerWidth <= 0 || cellWidth <= 0) return 1;
  return Math.max(1, Math.floor((containerWidth + gap) / (cellWidth + gap)));
}

/**
 * 넓어진 카드가 오른쪽 끝을 넘으면 왼쪽으로 넓힌다.
 * cellIndex 는 서가 전체 칸 번호(0 = + Project 칸)다.
 */
export function opensToLeft(cellIndex: number, columns: number, span = OPEN_CARD_SPAN): boolean {
  if (columns <= span) return false;
  const column = cellIndex % columns;
  return column + span > columns;
}

/**
 * 카드 하나가 오른쪽으로 넓어지면(Figma Home_hover) 같은 줄에서 그 뒤 카드가 두 칸(256px) 밀린다.
 * 밀려서 줄 끝을 넘는 카드는 잠깐 숨긴다(마우스를 떼면 제자리로 돌아온다).
 * 왼쪽으로 넓어지는 카드(줄 오른쪽 끝)는 앞 칸을 덮기만 하고 아무것도 밀지 않는다.
 */
export function pushStyle(
  cell: number,
  openCell: number | null,
  columns: number,
): CSSProperties | undefined {
  if (openCell === null || cell <= openCell || opensToLeft(openCell, columns)) return undefined;
  if (Math.floor(cell / columns) !== Math.floor(openCell / columns)) return undefined;
  const pushed = OPEN_CARD_SPAN - 1;
  const moved: CSSProperties = {
    transform: `translateX(calc((var(--size-shelf-card-width) + var(--grid-gutter)) * ${pushed}))`,
  };
  if ((cell % columns) + pushed >= columns) return { ...moved, opacity: 0, pointerEvents: 'none' };
  return moved;
}
