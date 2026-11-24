import { LIMITS, type Connection, type Node, type NodeSnapshot } from '@tome/shared';
import {
  canEditNode,
  nodeWeight,
  reorderPriorities,
  replaceEditedNode,
  restoreNode,
  sameEditableValues,
} from './edit-model';

/**
 * Connection Apply 규칙(#151): 상대의 예측 행동(predictedAction)을 그 노드 값 하나의 변화로 바꾼다.
 * 서버가 내는 예측 행동은 아이덴티티 세 축의 양·음 방향 6가지(remix.rules CONNECTION_TEMPLATES)다.
 * 각 행동은 그 축 점수를 상대 쪽으로 움직이는 조작으로 옮긴다.
 *
 * | 예측 행동             | 가중치 노드(keyword·attribute, 0~9) | 켜고 끄는 노드(dataType·evidence) | 우선순위(priority)   |
 * |-----------------------|-------------------------------------|-----------------------------------|----------------------|
 * | Lean on evidence      | −2 (직관 노드의 몫을 줄인다)        | 켠다                              | 한 칸 위로           |
 * | Trust intuition       | +2 (직관 노드의 몫을 늘린다)        | 끈다                              | 한 칸 아래로         |
 * | Make a bold change    | AI 값에서 먼 끝(AI ≤ 4 → 9, 아니면 0) | 반대로 바꾼다                    | 먼 끝으로(위 절반 → 맨 아래, 아니면 맨 위) |
 * | Take the lead         | +2 (9를 넘으면 −2)                  | 반대로 바꾼다                     | 한 칸 위로(맨 위면 아래로) |
 * | Keep the change small | AI 처음 값으로 되돌린다             | AI 처음 값으로                    | AI 처음 순서로       |
 * | Let the AI lead       | AI 처음 값으로 되돌린다             | AI 처음 값으로                    | AI 처음 순서로       |
 *
 * 값이 바뀌지 않으면(이미 그 값, 끝에 닿음, 모르는 행동, 고칠 수 없는 노드) null — Apply 를 잠근다.
 */
type Move = 'evidence' | 'intuition' | 'bold' | 'lead' | 'restore';

const ACTION_MOVES: ReadonlyMap<string, Move> = new Map<string, Move>([
  ['Lean on evidence', 'evidence'],
  ['Trust intuition', 'intuition'],
  ['Make a bold change', 'bold'],
  ['Take the lead', 'lead'],
  ['Keep the change small', 'restore'],
  ['Let the AI lead', 'restore'],
]);

/** 가중치를 한 번에 움직이는 칸 수. */
export const CONNECTION_WEIGHT_STEP = 2;

const clampWeight = (value: number) =>
  Math.min(LIMITS.WEIGHT_MAX, Math.max(LIMITS.WEIGHT_MIN, value));

function nextWeight(node: Node, move: Move): number {
  const weight = nodeWeight(node);
  const ai = node.aiInitial?.weight ?? weight;
  switch (move) {
    case 'evidence':
      return clampWeight(weight - CONNECTION_WEIGHT_STEP);
    case 'intuition':
      return clampWeight(weight + CONNECTION_WEIGHT_STEP);
    case 'bold':
      // 축 A 는 |최종 − AI| / 9 가 0.5 를 넘으면 큰 변화다. 먼 끝은 언제나 5칸 이상 떨어져 있다.
      return ai <= (LIMITS.WEIGHT_MAX - LIMITS.WEIGHT_MIN) / 2
        ? LIMITS.WEIGHT_MAX
        : LIMITS.WEIGHT_MIN;
    case 'lead':
      return weight + CONNECTION_WEIGHT_STEP <= LIMITS.WEIGHT_MAX
        ? weight + CONNECTION_WEIGHT_STEP
        : weight - CONNECTION_WEIGHT_STEP;
    case 'restore':
      return ai;
  }
}

function nextEnabled(node: Node, move: Move): boolean {
  switch (move) {
    case 'evidence':
      return true;
    case 'intuition':
      return false;
    case 'bold':
    case 'lead':
      return !node.enabled;
    case 'restore':
      return node.aiInitial?.enabled ?? node.enabled;
  }
}

/** 우선순위 목록에서 옮겨 갈 자리(0부터). */
function nextIndex(index: number, count: number, aiIndex: number, move: Move): number {
  const last = count - 1;
  switch (move) {
    case 'evidence':
      return Math.max(0, index - 1);
    case 'intuition':
      return Math.min(last, index + 1);
    case 'bold':
      return index < count / 2 ? last : 0;
    case 'lead':
      return index > 0 ? index - 1 : Math.min(last, 1);
    case 'restore':
      return aiIndex;
  }
}

function movePriority(snapshot: NodeSnapshot, node: Node, move: Move): NodeSnapshot {
  const byOrder = (key: (entry: Node) => number) =>
    snapshot.nodes.filter((entry) => entry.kind === 'priority').sort((a, b) => key(a) - key(b));
  const current = byOrder((entry) => entry.order ?? 0);
  const initial = byOrder((entry) => entry.aiInitial?.order ?? entry.order ?? 0);
  const index = current.findIndex((entry) => entry.id === node.id);
  const aiIndex = initial.findIndex((entry) => entry.id === node.id);
  const target = current[nextIndex(index, current.length, aiIndex, move)];
  return target ? reorderPriorities(snapshot, node.id, target.id) : snapshot;
}

/** 예측 행동이 Apply 규칙에 있는지. 없으면 Apply 를 잠근다. */
export function isApplicableAction(predictedAction: string): boolean {
  return ACTION_MOVES.has(predictedAction);
}

/** Connection 을 반영한 새 노드 묶음. 바뀌는 값이 없으면 null. */
export function applyConnection(
  snapshot: NodeSnapshot,
  connection: Pick<Connection, 'nodeId' | 'predictedAction'>,
): NodeSnapshot | null {
  const move = ACTION_MOVES.get(connection.predictedAction);
  const node = snapshot.nodes.find((entry) => entry.id === connection.nodeId);
  if (move === undefined || node === undefined || !canEditNode(node)) return null;
  let next: NodeSnapshot;
  if (node.kind === 'priority') next = movePriority(snapshot, node, move);
  else if (node.kind === 'keyword' || node.kind === 'attribute')
    next =
      move === 'restore'
        ? replaceEditedNode(snapshot, restoreNode(node, node))
        : replaceEditedNode(snapshot, { ...node, weight: nextWeight(node, move) });
  else next = replaceEditedNode(snapshot, { ...node, enabled: nextEnabled(node, move) });
  return sameEditableValues(next, snapshot) ? null : next;
}

/** 말풍선 Apply 의 상태. ready 만 누를 수 있다. */
export type ConnectionApplyState =
  /** 누를 수 있다 */
  | 'ready'
  /** 확정됐거나(서버 applied) 이번 편집에 이미 넣었다 */
  | 'applied'
  /** 예전 상대의 것(서버가 거절한다) */
  | 'stale'
  /** 이 노드는 이미 그 값이라 바꿀 것이 없다 */
  | 'no-change'
  /** 지금은 쓸 수 없다(모르는 행동·최신 버전이 아님·생성 중) */
  | 'unavailable';

/**
 * 말풍선 Apply 상태를 정한다. 순서: 반영됨 → 예전 상대 → 쓸 수 없음 → 바꿀 것 없음 → 누를 수 있음.
 * snapshot 은 그 세트의 지금 값(편집 중이면 고친 값)이고, 최신 확정 버전이 아니면 undefined 다.
 */
export function connectionApplyState(input: {
  connection: Pick<Connection, 'nodeId' | 'predictedAction' | 'status'>;
  /** 지금 상대가 낸 것인지 */
  current: boolean;
  /** 이번 편집 세션에서 이미 Apply 했는지 */
  appliedNow: boolean;
  /** 생성·확정 중이 아니고 그 노드를 고칠 수 있는지 */
  editable: boolean;
  snapshot: NodeSnapshot | undefined;
}): ConnectionApplyState {
  if (input.connection.status === 'applied' || input.appliedNow) return 'applied';
  if (!input.current) return 'stale';
  if (!input.editable || !input.snapshot || !isApplicableAction(input.connection.predictedAction))
    return 'unavailable';
  return applyConnection(input.snapshot, input.connection) === null ? 'no-change' : 'ready';
}
