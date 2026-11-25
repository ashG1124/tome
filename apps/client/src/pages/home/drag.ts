import { clampCell, type Cell } from './freeLayout';

/** 누른 채 이만큼(px) 넘게 움직여야 끌기로 본다. 그보다 적게 움직이고 떼면 클릭(프로젝트 열기)이다. */
export const DRAG_THRESHOLD = 6;

/**
 * 서가 격자 치수(서가 목록 기준 좌표). 첫 칸(0, 0)의 왼쪽 위가 origin 이고,
 * 칸 사이 거리(pitch)는 카드 크기 + 간격이다(Figma 가로 128, 세로 212).
 */
export interface GridMetrics {
  originX: number;
  originY: number;
  pitchX: number;
  pitchY: number;
}

/** 누른 자리에서 움직인 거리가 끌기 기준을 넘었는지. */
export function passedThreshold(dx: number, dy: number, threshold = DRAG_THRESHOLD): boolean {
  return Math.hypot(dx, dy) > threshold;
}

/** 칸의 왼쪽 위(서가 목록 기준 좌표). */
export function cellOrigin(metrics: GridMetrics, cell: Cell): { x: number; y: number } {
  return {
    x: metrics.originX + cell.col * metrics.pitchX,
    y: metrics.originY + cell.row * metrics.pitchY,
  };
}

/**
 * 카드 왼쪽 위가 (x, y) 에 있을 때 들어갈 칸: 가장 가까운 칸으로 맞추고(격자에 붙이기),
 * 서가 밖이면 가장자리 칸으로 자른다. + Project 칸이면 null.
 */
export function cellAt(
  metrics: GridMetrics,
  x: number,
  y: number,
  columns: number,
  maxRow: number,
): Cell | null {
  if (metrics.pitchX <= 0 || metrics.pitchY <= 0) return null;
  return clampCell(
    {
      col: (x - metrics.originX) / metrics.pitchX,
      row: (y - metrics.originY) / metrics.pitchY,
    },
    columns,
    maxRow,
  );
}

/** from 칸에서 to 칸까지 옮겨 그리는 거리. */
export function cellDelta(metrics: GridMetrics, from: Cell, to: Cell): { x: number; y: number } {
  return {
    x: (to.col - from.col) * metrics.pitchX,
    y: (to.row - from.row) * metrics.pitchY,
  };
}
