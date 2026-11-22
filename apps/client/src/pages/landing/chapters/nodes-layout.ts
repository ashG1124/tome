/**
 * 기준안 좌표(1728×1117 기준)로 노드 열을 배치하는 순수 계산.
 * 좌표는 MY WORK 캔버스(3423×1457) 안의 값이고, 열 하나는 `COLUMN_W` 폭이다.
 * REMIX 지도는 같은 배치를 줄여서(MAP_SCALE) 쓴다.
 */
import type { DemoEntry, DemoStep, StepId } from './demoData';

export const COLUMN_W = 300;
/** 열 맨 위(손잡이 막대 윗선)의 캔버스 y */
export const COLUMN_TOP = 95.5;
/** 열 안에서 헤더 알약의 위쪽 y(손잡이 막대 아래 18) */
export const PILL_TOP = 18;
export const PILL_H = 62;
/** 라벨 높이와 라벨~칩 간격 */
export const LABEL_H = 21;
export const LABEL_GAP = 8;
/** 첫 칸의 라벨이 놓이는 열 안 y */
export const FIRST_ENTRY_TOP = 104;
export const ROW_H = 27;
export const CHIP_PAD_Y = 16;
export const BOX_PAD_Y = 20;
export const BOX_ROW_GAP = 12;
export const CHIP_GAP = 20;
export const GROUP_GAP = 40;

/** 각 단계 열의 왼쪽 x(캔버스) */
export const COLUMN_X: Readonly<Record<StepId, number>> = {
  s1: 698,
  s2: 1093.25,
  s3: 1488.5,
  s4: 1883.75,
  s5: 2279,
};

/** 프롬프트 노드 왼쪽 위와 크기(캔버스) */
export const PROMPT_NODE = { x: 69.5, y: 301, w: 400, h: 260 } as const;

/** 캔버스 안 헤더 알약 가운데 y(연결선 높이) */
export const PILL_CENTER_Y = COLUMN_TOP + PILL_H / 2 + PILL_TOP;

/** REMIX 지도가 MY WORK 열을 줄이는 비율(159.45 / 300) */
export const MAP_SCALE = 159.45 / 300;

export interface PlacedEntry {
  entry: DemoEntry;
  index: number;
  /** 열 안에서 칸 위쪽 y(라벨이 있으면 라벨 위쪽) */
  top: number;
  /** 칸 위쪽에서 칩 위쪽까지(라벨이 없으면 0) */
  chipOffset: number;
  chipH: number;
  height: number;
}

/** 칩 높이. 줄 수에 따라 달라지고, 목록 상자는 안쪽 여백이 더 크다. */
export function chipHeight(entry: DemoEntry): number {
  const lines = entry.rows.map((row) => row.length);
  const total = lines.reduce((sum, n) => sum + n * ROW_H, 0);
  if (entry.kind === 'rank' || entry.kind === 'check') {
    return total + BOX_PAD_Y * 2 + BOX_ROW_GAP * (lines.length - 1);
  }
  return total + CHIP_PAD_Y * 2;
}

/** 한 열의 칸들을 위에서 아래로 쌓아 y 를 정한다. */
export function layoutColumn(step: DemoStep): PlacedEntry[] {
  const placed: PlacedEntry[] = [];
  let cursor = FIRST_ENTRY_TOP;
  step.entries.forEach((entry, index) => {
    const chipH = chipHeight(entry);
    if (index > 0) cursor += entry.label ? GROUP_GAP : CHIP_GAP;
    const chipOffset = entry.label ? LABEL_H + LABEL_GAP : 0;
    const height = chipOffset + chipH;
    placed.push({ entry, index, top: cursor, chipOffset, chipH, height });
    cursor += height;
  });
  return placed;
}

/** 두 점을 잇는 가로 접선 곡선(베지어) 경로 */
export function connectorPath(x1: number, y1: number, x2: number, y2: number): string {
  const d = Math.max(20, x2 - x1) * 0.6;
  const f = (n: number) => n.toFixed(2);
  return `M${f(x1)} ${f(y1)}C${f(x1 + d)} ${f(y1)} ${f(x2 - d)} ${f(y2)} ${f(x2)} ${f(y2)}`;
}

/** MY WORK 캔버스의 연결선 6개: [출발 x, y, 도착 x, y] */
export const MY_WORK_LINKS: ReadonlyArray<readonly [number, number, number, number]> = [
  [PROMPT_NODE.x + PROMPT_NODE.w, PROMPT_NODE.y + PROMPT_NODE.h / 2, COLUMN_X.s1, PILL_CENTER_Y],
  [COLUMN_X.s1 + COLUMN_W, PILL_CENTER_Y, COLUMN_X.s2, PILL_CENTER_Y],
  [COLUMN_X.s2 + COLUMN_W, PILL_CENTER_Y, COLUMN_X.s3, PILL_CENTER_Y],
  [COLUMN_X.s3 + COLUMN_W, PILL_CENTER_Y, COLUMN_X.s4, PILL_CENTER_Y],
  [COLUMN_X.s4 + COLUMN_W, PILL_CENTER_Y, COLUMN_X.s5, PILL_CENTER_Y],
  [COLUMN_X.s5 + COLUMN_W, PILL_CENTER_Y, 2782, 471.5],
];
