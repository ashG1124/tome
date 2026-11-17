import { isDeepStrictEqual } from 'node:util';
import type { JobStage, Node, NodeSnapshot } from '@tome/shared';
import { stageIndex } from './stages';

export interface RevisionChange {
  nodeId: string;
  field: string;
}

export type RevisionPlan =
  | { kind: 'ok'; startStage: JobStage; changes: RevisionChange[] }
  | { kind: 'none' }
  | { kind: 'invalid'; path: string; message: string };

type EditableField = 'enabled' | 'weight' | 'pad' | 'order';

/** 노드 종류별로 바꿀 수 있는 값과, 그 값이 바뀔 때 다시 시작할 단계. */
const START_STAGE: Partial<Record<Node['kind'], Partial<Record<EditableField, JobStage>>>> = {
  keyword: { enabled: 'assemble', weight: 'assemble', pad: 'assemble' },
  attribute: { enabled: 'assemble', weight: 'assemble' },
  dataType: { enabled: 'evidence' },
  priority: { enabled: 'evidence', order: 'evidence' },
  evidence: { enabled: 'draft' },
};

const FIXED_FIELDS = [
  'stage',
  'kind',
  'text',
  'parentIds',
  'category',
  'negative',
  'sourceType',
  'domain',
  'level',
  'aiInitial',
] as const;

const invalid = (path: string, message: string): RevisionPlan => ({
  kind: 'invalid',
  path,
  message,
});

function changedFields(base: Node, next: Node): EditableField[] | string {
  for (const field of FIXED_FIELDS) {
    if (!isDeepStrictEqual(base[field], next[field])) return field;
  }
  const fields: EditableField[] = [];
  if (base.enabled !== next.enabled) fields.push('enabled');
  if (base.weight !== next.weight) fields.push('weight');
  if (base.order !== next.order) fields.push('order');
  if (!isDeepStrictEqual(base.pad, next.pad)) {
    // 축 이름은 바꿀 수 없다. 좌표나 있고 없음만 pad 변경이다.
    if (
      base.pad &&
      next.pad &&
      !isDeepStrictEqual([base.pad.xAxis, base.pad.yAxis], [next.pad.xAxis, next.pad.yAxis])
    ) {
      return 'pad.axis';
    }
    fields.push('pad');
  }
  return fields;
}

/**
 * 기준 답변과 요청 노드를 노드 id 로 비교해 가장 이른 시작 단계를 정한다(순수 함수).
 * 허용하지 않는 수정(글·id 추가/삭제·주제 틀 등)은 invalid, 바뀐 게 없으면 none.
 * 검증 노드(criterion·mismatch)의 켜짐 변경은 재생성 대상이 아니라 무시한다.
 */
export function planRevision(base: NodeSnapshot, requested: NodeSnapshot): RevisionPlan {
  if (base.subjectTemplate !== requested.subjectTemplate) {
    return invalid('nodes.subjectTemplate', 'The subject template cannot be edited.');
  }
  const baseById = new Map(base.nodes.map((n) => [n.id, n]));
  if (
    baseById.size !== requested.nodes.length ||
    requested.nodes.some((n) => !baseById.has(n.id))
  ) {
    return invalid('nodes', 'Nodes cannot be added or removed.');
  }

  const changes: RevisionChange[] = [];
  let earliest: JobStage | null = null;
  for (const next of requested.nodes) {
    const before = baseById.get(next.id)!;
    const fields = changedFields(before, next);
    if (typeof fields === 'string') {
      return invalid(`nodes.${next.id}.${fields}`, 'This value cannot be edited.');
    }
    const isVerifyNode = next.kind === 'criterion' || next.kind === 'mismatch';
    for (const field of fields) {
      if (isVerifyNode && field === 'enabled') continue;
      const stage = START_STAGE[next.kind]?.[field];
      if (!stage) return invalid(`nodes.${next.id}.${field}`, 'This value cannot be edited.');
      changes.push({ nodeId: next.id, field });
      if (earliest === null || stageIndex(stage) < stageIndex(earliest)) earliest = stage;
    }
  }
  if (earliest === null) return { kind: 'none' };
  return { kind: 'ok', startStage: earliest, changes };
}
