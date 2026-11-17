import type { IdentityAxes } from '@tome/shared';
import { COPY, type CopyKey } from '../../shared/copy';
import type { ChartKey, Quadrant } from './identity';

/** 좌표 판 네 변의 축 이름(위·아래·왼쪽·오른쪽) */
export const AXIS_LABELS: Readonly<
  Record<ChartKey, { top: CopyKey; bottom: CopyKey; left: CopyKey; right: CopyKey }>
> = {
  ai: { top: 'P-13a', bottom: 'P-13b', left: 'P-13c', right: 'P-13d' },
  decision: { top: 'P-13e', bottom: 'P-13f', left: 'P-13g', right: 'P-13h' },
};

/** 숨김 표에서 축 하나를 부르는 이름: "왼쪽(위) – 오른쪽(아래)" */
export function axisName(axis: keyof IdentityAxes): string {
  const pair: Record<keyof IdentityAxes, [CopyKey, CopyKey]> = {
    aiRelation: ['P-13c', 'P-13d'],
    scaleIntensity: ['P-13a', 'P-13b'],
    decisionBasis: ['P-13g', 'P-13h'],
    direction: ['P-13e', 'P-13f'],
  };
  const [from, to] = pair[axis];
  return `${COPY[from]} – ${COPY[to]}`;
}

/** 사분면별 말풍선(좌표 2장 × 사분면 4개 = 8개). 문구 ID 는 P-18-<좌표>-<사분면>. */
const BUBBLES: Record<`${ChartKey}-${Quadrant}`, CopyKey> = {
  'ai-top-left': 'P-18-ai-top-left',
  'ai-top-right': 'P-18-ai-top-right',
  'ai-bottom-left': 'P-18-ai-bottom-left',
  'ai-bottom-right': 'P-18-ai-bottom-right',
  'decision-top-left': 'P-18-decision-top-left',
  'decision-top-right': 'P-18-decision-top-right',
  'decision-bottom-left': 'P-18-decision-bottom-left',
  'decision-bottom-right': 'P-18-decision-bottom-right',
};

export function bubbleText(chart: ChartKey, quadrant: Quadrant | null): string | null {
  if (quadrant === null) return null;
  return COPY[BUBBLES[`${chart}-${quadrant}`]];
}
