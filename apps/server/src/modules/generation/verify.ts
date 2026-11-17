import type { Node, Verification } from '@tome/shared';

/**
 * 검증 기준만 만든다(AI 호출 없음, 측정 전이라 status 는 skipped).
 * draft 의 켜진 attribute 마다 기준 노드 하나(v1, v2, ...)를 만든다.
 */
export function buildVerification(nodes: readonly Node[]): Verification {
  const criteria: Node[] = nodes
    .filter((n) => n.stage === 'draft' && n.kind === 'attribute' && n.enabled)
    .map((attribute, index) => ({
      id: `v${index + 1}`,
      stage: 'verify',
      kind: 'criterion',
      text: `The image shows ${attribute.text}.`,
      enabled: true,
      parentIds: [attribute.id],
    }));
  return { status: 'skipped', criteria, mismatches: [] };
}
