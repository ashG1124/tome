/**
 * 코멘트를 달 수 있는 노드 id 들.
 * - 답변 nodes 스냅샷의 노드(1~4단계)
 * - 5단계 검증 기준(verification.criteria). 불일치(mismatches)는 보기 전용이라 받지 않는다.
 * JSON 컬럼 값이라 모양을 믿지 않고, 문자열 id 만 모은다.
 */
export function commentableNodeIds(answer: { nodes: unknown; verification: unknown }): Set<string> {
  const ids = (list: unknown): string[] =>
    Array.isArray(list)
      ? list
          .map((node) => (node as { id?: unknown } | null)?.id)
          .filter((id): id is string => typeof id === 'string')
      : [];
  const nodes = (answer.nodes as { nodes?: unknown } | null)?.nodes;
  const criteria = (answer.verification as { criteria?: unknown } | null)?.criteria;
  return new Set([...ids(nodes), ...ids(criteria)]);
}
