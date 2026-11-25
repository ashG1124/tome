import type { CardData, CanvasNode } from './model';

/**
 * 노드 끌어 옮기기(#230) 규칙. 끄는 단위(unit)는 함께 움직이는 노드 묶음이다.
 * - 프롬프트 노드: 혼자 움직인다.
 * - 단계 알약(1~5단계): 그 세트의 그 단계 열 전체(소제목·카드·자리 카드)가 함께 움직인다.
 * - 묶음 소제목: 그 소제목과 아래 카드(같은 묶음)가 함께 움직인다.
 * - 답변 카드·원작 답변 카드: 혼자(파생의 머리글은 카드를 따라간다) 움직인다.
 * - 그 밖의 노드(단계 카드·자리 카드·머리글)는 혼자 움직이지 않는다. 끌면 캔버스가 움직인다.
 */
export interface Point {
  x: number;
  y: number;
}

/** 노드가 속한 끄는 단위들. 바깥 단위(단계 열)부터 안쪽(묶음) 순서다. */
export function dragUnits(data: CardData): string[] {
  const { setId, column } = data;
  if (data.kind === 'prompt') return [`${setId}:prompt`];
  if (column >= 1 && column <= 5)
    return [`${setId}:column:${column}`, ...(data.group ? [`${setId}:group:${data.group}`] : [])];
  if (data.kind === 'origin' || data.variant === 'origin') return [`${setId}:origin`];
  if (data.kind === 'answer' || data.variant === 'answer') return [`${setId}:answer`];
  return [];
}

/** 이 노드를 끌면 움직이는 단위. 혼자 움직이지 않는 노드면 undefined. */
export function dragSource(data: CardData): string | undefined {
  const units = dragUnits(data);
  if (data.kind === 'prompt' || data.kind === 'answer' || data.kind === 'origin') return units[0];
  if (data.kind !== 'heading') return undefined;
  if (data.variant === 'step') return units[0];
  if (data.variant === 'group') return units[1];
  return undefined;
}

/** 끄는 노드와 함께 움직일 다른 노드 id. */
export function dragMembers(nodes: readonly CanvasNode[], sourceId: string): string[] {
  const source = nodes.find((node) => node.id === sourceId);
  const unit = source ? dragSource(source.data) : undefined;
  if (!unit) return [];
  return nodes
    .filter((node) => node.id !== sourceId && dragUnits(node.data).includes(unit))
    .map((node) => node.id);
}

/** 사용자가 끌어 둔 거리의 합(노드가 속한 모든 단위). 새로 그려지는 노드도 이만큼 옮겨 놓는다. */
export function dragOffset(offsets: ReadonlyMap<string, Point>, data: CardData): Point {
  let x = 0;
  let y = 0;
  for (const unit of dragUnits(data)) {
    const offset = offsets.get(unit);
    if (!offset) continue;
    x += offset.x;
    y += offset.y;
  }
  return { x, y };
}

/** 노드를 사용자가 끌어 둔 거리만큼 옮긴 사본. 끈 거리가 없으면 그 노드를 그대로 돌려준다. */
export function withDragOffset(node: CanvasNode, offsets: ReadonlyMap<string, Point>): CanvasNode {
  const offset = dragOffset(offsets, node.data);
  return offset.x || offset.y
    ? { ...node, position: { x: node.position.x + offset.x, y: node.position.y + offset.y } }
    : node;
}
