import type { IdentityAxes, Node } from '@tome/shared';
import { domainOf, type SignalAxis } from '../identity/identity-calc';

/** Connection 계산에 쓰는 상수는 모두 여기에 둔다. */
export const CONNECTION_RULES = {
  /** 상대 점수의 크기가 이 값 이상이어야 판정한다. */
  MIN_PARTNER_ABS: 20,
  /** 내 점수가 상대와 이만큼 이상 벌어져도 "갈림"이다(반대 부호면 벌어진 정도와 무관). */
  MIN_GAP: 40,
  /** 상대의 해당 축 조작 수가 이 값 미만이면 숨긴다(콜드스타트). */
  MIN_EVIDENCE_TOTAL: 3,
  /** 답변 하나에 저장하는 Connection 의 상한. */
  MAX_PER_ANSWER: 5,
} as const;

export type TemplateKey =
  | 'basis.evidence'
  | 'basis.intuitive'
  | 'scale.bold'
  | 'scale.passive'
  | 'relation.dominant'
  | 'relation.autonomy';

interface Template {
  axis: SignalAxis;
  /** 상대 점수 부호(+1 / −1). */
  direction: 1 | -1;
  predictedAction: string;
  /** 영어 한 문장. {count}·{total} 자리에 근거 수치가 들어간다. */
  sentence: string;
}

/** 화면에 보이는 문장 목록. 한 곳에서만 고친다. */
export const CONNECTION_TEMPLATES: Record<TemplateKey, Template> = {
  'basis.evidence': {
    axis: 'decisionBasis',
    direction: 1,
    predictedAction: 'Lean on evidence',
    sentence: 'Leaned on evidence {count} of {total} times',
  },
  'basis.intuitive': {
    axis: 'decisionBasis',
    direction: -1,
    predictedAction: 'Trust intuition',
    sentence: 'Went with intuition {count} of {total} times',
  },
  'scale.bold': {
    axis: 'scaleIntensity',
    direction: 1,
    predictedAction: 'Make a bold change',
    sentence: 'Made bold changes {count} of {total} times',
  },
  'scale.passive': {
    axis: 'scaleIntensity',
    direction: -1,
    predictedAction: 'Keep the change small',
    sentence: 'Kept changes small {count} of {total} times',
  },
  'relation.dominant': {
    axis: 'aiRelation',
    direction: 1,
    predictedAction: 'Take the lead',
    sentence: 'Took the lead over the AI {count} of {total} times',
  },
  'relation.autonomy': {
    axis: 'aiRelation',
    direction: -1,
    predictedAction: 'Let the AI lead',
    sentence: 'Let the AI draft stand {count} of {total} times',
  },
};

export function templateKeyFor(axis: SignalAxis, direction: 1 | -1): TemplateKey {
  const found = (Object.entries(CONNECTION_TEMPLATES) as [TemplateKey, Template][]).find(
    ([, template]) => template.axis === axis && template.direction === direction,
  );
  return found![0];
}

export function renderSentence(key: TemplateKey, count: number, total: number): string {
  return CONNECTION_TEMPLATES[key].sentence
    .replace('{count}', String(count))
    .replace('{total}', String(total));
}

const TEXT_STAGES = new Set(['analyze', 'research', 'evidence', 'draft']);

/**
 * 노드가 어느 축으로 판정되는지. 우선순위: priority 노드 → 축 A, 초안 단계 노드 → 축 B,
 * 그 밖에 성향(근거·직관) 태그가 있는 노드 → 축 C. 해당 없으면 판정하지 않는다.
 */
export function axisOfNode(node: Pick<Node, 'id' | 'stage' | 'kind'>): SignalAxis | null {
  if (!TEXT_STAGES.has(node.stage)) return null;
  if (node.kind === 'priority') return 'scaleIntensity';
  if (node.stage === 'draft') return 'aiRelation';
  return domainOf(node.id) === null ? null : 'decisionBasis';
}

/** 갈림: 상대의 뚜렷한 성향(|p| ≥ 20)에 내가 반대거나 많이 벌어져 있다. 점수가 없으면 판정하지 않는다. */
export function isDivergent(partnerScore: number | null, myScore: number | null): boolean {
  if (partnerScore === null) return false;
  if (Math.abs(partnerScore) < CONNECTION_RULES.MIN_PARTNER_ABS) return false;
  const mine = myScore ?? 0;
  if (mine * partnerScore < 0) return true;
  return Math.abs(partnerScore - mine) >= CONNECTION_RULES.MIN_GAP;
}

export interface PlannedConnection {
  nodeId: string;
  axis: SignalAxis;
  templateKey: TemplateKey;
  predictedAction: string;
  sentence: string;
  evidenceCount: number;
  evidenceTotal: number;
}

export interface PlanInput {
  nodes: Pick<Node, 'id' | 'stage' | 'kind'>[];
  partnerAxes: IdentityAxes;
  /** 내 최신 스냅샷의 축(없으면 null). */
  myAxes: IdentityAxes | null;
  /** 상대의 축별 조작 방향 부호(identity-calc 의 axisSignals). */
  partnerSignals: Record<SignalAxis, number[]>;
}

/** 근거 비율이 큰 순, 동률이면 nodeId 순. 나눗셈 없이 교차곱으로 비교한다. */
export function compareByEvidence(
  a: { evidenceCount: number; evidenceTotal: number; nodeId: string },
  b: { evidenceCount: number; evidenceTotal: number; nodeId: string },
): number {
  const diff = b.evidenceCount * a.evidenceTotal - a.evidenceCount * b.evidenceTotal;
  if (diff !== 0) return diff;
  return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
}

/** 갈림인 노드의 Connection 후보를 모두 만든다(상한 적용 전, 정렬됨). */
export function planConnections(input: PlanInput): PlannedConnection[] {
  const planned: PlannedConnection[] = [];
  for (const node of input.nodes) {
    const axis = axisOfNode(node);
    if (axis === null) continue;
    const p = input.partnerAxes[axis];
    const m = input.myAxes?.[axis] ?? null;
    if (p === null || !isDivergent(p, m)) continue;
    const direction: 1 | -1 = p > 0 ? 1 : -1;
    const signals = input.partnerSignals[axis];
    const evidenceTotal = signals.length;
    if (evidenceTotal < CONNECTION_RULES.MIN_EVIDENCE_TOTAL) continue;
    const evidenceCount = signals.filter((sign) => sign === direction).length;
    const templateKey = templateKeyFor(axis, direction);
    planned.push({
      nodeId: node.id,
      axis,
      templateKey,
      predictedAction: CONNECTION_TEMPLATES[templateKey].predictedAction,
      sentence: renderSentence(templateKey, evidenceCount, evidenceTotal),
      evidenceCount,
      evidenceTotal,
    });
  }
  return planned.sort(compareByEvidence);
}
