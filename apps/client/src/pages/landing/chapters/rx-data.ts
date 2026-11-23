/**
 * 기준안 좌표(1728×1117 기준)
 * REMIX 노드 지도 배치. MY WORK 노드 열(폭 300)을 MAP_SCALE 만큼 줄여 지도 안에 늘어놓는다.
 */
import type { StepId } from './demoData';
import { COLUMN_W, MAP_SCALE, PILL_H, PILL_TOP, PROMPT_NODE } from './nodes-layout';

/** 지도 안 프롬프트 노드 왼쪽 위 */
export const MAP_PROMPT = { x: -39.68, y: 287 } as const;

/** 지도 안 단계 열 왼쪽 위(손잡이 막대 윗선) */
export const MAP_COLUMNS: Readonly<Record<StepId, { x: number; y: number }>> = {
  s1: { x: 264.48, y: 396 },
  s2: { x: 474.95, y: 282 },
  s3: { x: 684.88, y: 376 },
  s4: { x: 894.82, y: 216 },
  s5: { x: 1104.75, y: 329 },
};

/** 지도 안 답변 카드 이미지 자리와, 연결선이 닿는 왼쪽 점 */
export const MAP_ANSWER = {
  x: 1361.2,
  y: 404.9,
  w: 314.9,
  h: 227.4,
  dotX: 1372.09,
  dotY: 527.73,
} as const;

/** 다른 창작자가 다르게 판단했을 자리에 뜨는 표시(지도 좌표) */
export const MAP_MARKERS: ReadonlyArray<readonly [number, number]> = [
  [666, 539],
  [876, 471],
  [876, 622],
];

/** 지도에서 열을 이루는 노드 순서: 프롬프트, 1~5단계, 답변 */
export const MAP_ORDER: readonly (StepId | 'prompt' | 'answer')[] = [
  'prompt',
  's1',
  's2',
  's3',
  's4',
  's5',
  'answer',
];

/** 각 노드가 MY WORK 크기에서 지도로 줄어들기 전 왼쪽 위(지도 좌표, 프롬프트·1~5단계) */
export const MAP_START: ReadonlyArray<readonly [number, number]> = [
  [-1636, 312],
  [-1065, 162],
  [-669, 164],
  [-274, 164],
  [121, 164],
  [516, 164],
];
/** 답변 카드가 줄어들기 전 가운데 점과 배율 */
export const MAP_ANSWER_START = { x: 1019, y: 319, dx: 10.9, dy: 7.1 } as const;

const PILL_CENTER = (PILL_TOP + PILL_H / 2) * MAP_SCALE;

/** 연결선 한 개: [출발 노드, x, y, 도착 노드, x, y] — 노드 번호는 MAP_ORDER 순서 */
export type MapLink = readonly [number, number, number, number, number, number];

function columnEdge(id: StepId, side: 'left' | 'right'): [number, number] {
  const col = MAP_COLUMNS[id];
  return [col.x + (side === 'right' ? COLUMN_W * MAP_SCALE : 0), col.y + PILL_CENTER];
}

/** 지도 좌표 기준 연결선 여섯 개의 양 끝(노드가 움직일 때 이 점을 따라간다) */
export function mapLinks(): MapLink[] {
  const steps: StepId[] = ['s1', 's2', 's3', 's4', 's5'];
  const links: MapLink[] = [];
  const promptOut: [number, number] = [
    MAP_PROMPT.x + PROMPT_NODE.w * MAP_SCALE,
    MAP_PROMPT.y + (PROMPT_NODE.h / 2) * MAP_SCALE,
  ];
  const s1Left = columnEdge('s1', 'left');
  links.push([0, promptOut[0], promptOut[1], 1, s1Left[0], s1Left[1]]);
  steps.forEach((id, i) => {
    const out = columnEdge(id, 'right');
    const next = steps[i + 1];
    if (next) {
      const into = columnEdge(next, 'left');
      links.push([i + 1, out[0], out[1], i + 2, into[0], into[1]]);
    } else {
      links.push([i + 1, out[0], out[1], 6, MAP_ANSWER.dotX, MAP_ANSWER.dotY]);
    }
  });
  return links;
}
