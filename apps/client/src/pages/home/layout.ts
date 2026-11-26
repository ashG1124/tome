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
 * cellIndex 는 줄 안의 칸 번호(col)다. 줄을 넘는 번호를 주면 칸 수로 나눈 나머지로 본다.
 */
export function opensToLeft(cellIndex: number, columns: number, span = OPEN_CARD_SPAN): boolean {
  if (columns <= span) return false;
  const column = cellIndex % columns;
  return column + span > columns;
}

/**
 * 카드 하나가 넓어지면(Figma Home_hover) 같은 줄 옆 카드가 shift 칸만큼 밀린다(freeLayout pushShifts).
 * shift 가 양수면 오른쪽, 음수면 왼쪽(오른쪽 끝 카드가 왼쪽으로 넓어질 때, #250)으로 민다.
 * 밀려서 줄 끝(col + shift ≥ columns)을 넘거나 줄 첫 카드 칸(firstCol, 맨 윗줄은 + Project 다음 칸)보다
 * 앞으로 가는 카드는 잠깐 숨긴다(마우스를 떼면 제자리로 돌아온다).
 */
export function pushStyle(
  shift: number,
  col: number,
  columns: number,
  firstCol = 0,
): CSSProperties | undefined {
  if (shift === 0) return undefined;
  const moved: CSSProperties = {
    transform: `translateX(calc((var(--size-shelf-card-width) + var(--grid-gutter)) * ${shift}))`,
  };
  const to = col + shift;
  if (to >= columns || to < firstCol) return { ...moved, opacity: 0, pointerEvents: 'none' };
  return moved;
}
