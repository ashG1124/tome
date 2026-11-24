import type { CompareEntry, IdentityAxes } from '@tome/shared';
import { COPY, type CopyKey } from '../../shared/copy';
import { quadrantOf, type ChartKey, type Quadrant } from './identity';

/** 좌표 판 네 변의 축 이름(위·아래·왼쪽·오른쪽) */
export const AXIS_LABELS: Readonly<
  Record<ChartKey, { top: CopyKey; bottom: CopyKey; left: CopyKey; right: CopyKey }>
> = {
  ai: { top: 'P-13a', bottom: 'P-13b', left: 'P-13c', right: 'P-13d' },
  decision: { top: 'P-13e', bottom: 'P-13f', left: 'P-13g', right: 'P-13h' },
};

/** 좌표 판 안 네 변의 짧은 축 이름(Proto v7 4181:35209·4181:35212). 같은 뜻의 긴 이름(AXIS_LABELS)은 숨김 표가 쓴다. */
export const CHART_LABELS: Readonly<
  Record<ChartKey, { top: CopyKey; bottom: CopyKey; left: CopyKey; right: CopyKey }>
> = {
  ai: { top: 'P-31a', bottom: 'P-31b', left: 'P-31c', right: 'P-31d' },
  decision: { top: 'P-31e', bottom: 'P-31f', left: 'P-31g', right: 'P-31h' },
};

/** 오른쪽 Identity 필터 판의 축 이름(4181:35757). 판단 근거 쪽만 좌표 판과 글자가 조금 다르다(Trust data·Trust gut). */
export const MATRIX_LABELS: Readonly<
  Record<ChartKey, { top: CopyKey; bottom: CopyKey; left: CopyKey; right: CopyKey }>
> = {
  ai: CHART_LABELS.ai,
  decision: { top: 'P-31e', bottom: 'P-31f', left: 'P-32a', right: 'P-32b' },
};

/** 사분면 한 칸을 부르는 이름(필터 칸 낭독용): "위 이름, 왼쪽 이름" */
export function quadrantName(chart: ChartKey, quadrant: Quadrant): string {
  const labels = MATRIX_LABELS[chart];
  const [vertical, horizontal] = quadrant.split('-') as ['top' | 'bottom', 'left' | 'right'];
  return `${COPY[labels[vertical]]}, ${COPY[labels[horizontal]]}`;
}

const DESCRIPTIONS: Record<`${ChartKey}-${Quadrant}`, CopyKey> = {
  'ai-top-left': 'P-33-ai-top-left',
  'ai-top-right': 'P-33-ai-top-right',
  'ai-bottom-left': 'P-33-ai-bottom-left',
  'ai-bottom-right': 'P-33-ai-bottom-right',
  'decision-top-left': 'P-33-decision-top-left',
  'decision-top-right': 'P-33-decision-top-right',
  'decision-bottom-left': 'P-33-decision-bottom-left',
  'decision-bottom-right': 'P-33-decision-bottom-right',
};

/**
 * 창작자 줄 아래 한 줄 설명. 한 줄 소개(bio)가 있으면 그것을, 없으면 사분면 조각을 이어 만든다
 * (예: "Lets the AI lead and nudges gently — trusts gut, explores far."). 점수가 없으면 null.
 */
export function creatorDescription(entry: CompareEntry): string | null {
  if (entry.creator.bio !== null) return entry.creator.bio;
  const ai = quadrantOf(entry.axes, 'ai');
  const decision = quadrantOf(entry.axes, 'decision');
  const aiText = ai === null ? null : COPY[DESCRIPTIONS[`ai-${ai}`]];
  const decisionText = decision === null ? null : COPY[DESCRIPTIONS[`decision-${decision}`]];
  if (aiText !== null && decisionText !== null) return `${aiText} — ${decisionText}.`;
  if (aiText !== null) return `${aiText}.`;
  if (decisionText !== null)
    return `${decisionText.charAt(0).toUpperCase()}${decisionText.slice(1)}.`;
  return null;
}

/**
 * 숨김 표에서 축 하나를 부르는 이름: "− 쪽 – + 쪽". 네 축 모두 점수가 + 일수록 뒤 이름 쪽이다.
 * (판단 근거는 + 가 Evidence 라서 화면 왼쪽 이름이 뒤에 온다)
 */
export function axisName(axis: keyof IdentityAxes): string {
  const pair: Record<keyof IdentityAxes, [CopyKey, CopyKey]> = {
    aiRelation: ['P-13c', 'P-13d'],
    scaleIntensity: ['P-13a', 'P-13b'],
    decisionBasis: ['P-13h', 'P-13g'],
    direction: ['P-13e', 'P-13f'],
  };
  const [from, to] = pair[axis];
  return `${COPY[from]} – ${COPY[to]}`;
}
