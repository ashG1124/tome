import { useMemo, useRef } from 'react';
import { useReactFlow, type Edge, type OnNodeDrag } from '@xyflow/react';
import type { CanvasNode } from '../model';
import { dragMembers, dragSource, type Point } from '../drag-model';

/**
 * 이 거리(화면 px)보다 덜 움직인 누름은 클릭이다(노드 열기·답변 크게 보기). 더 움직이면 끌기이고 클릭은 일어나지 않는다.
 * React Flow 의 nodeDragThreshold·nodeClickDistance 에 같은 값을 준다.
 */
export const DRAG_DISTANCE = 4;

interface ActiveDrag {
  unit: string;
  start: Point;
  members: Map<string, Point>;
}

/**
 * 노드 끌어 옮기기(#230). 위 노드(단계 알약·묶음 소제목)를 끌면 아래 노드가 같은 거리만큼 함께 움직인다.
 * 끝나면 단위별로 끈 거리를 offsets 에 더해 둔다. 다시 쌓기(useMeasuredStack)와 새로 그려지는 노드가 이 값을 쓴다.
 */
export function useNodeDrag() {
  const flow = useReactFlow<CanvasNode, Edge>();
  const offsets = useRef(new Map<string, Point>());
  const active = useRef<ActiveDrag | undefined>(undefined);

  return useMemo(() => {
    const follow = (node: CanvasNode) => {
      const drag = active.current;
      if (!drag || drag.members.size === 0) return;
      const dx = node.position.x - drag.start.x;
      const dy = node.position.y - drag.start.y;
      flow.setNodes((nodes) =>
        nodes.map((entry) => {
          const from = drag.members.get(entry.id);
          return from ? { ...entry, position: { x: from.x + dx, y: from.y + dy } } : entry;
        }),
      );
    };
    const onNodeDragStart: OnNodeDrag<CanvasNode> = (_event, node) => {
      const unit = dragSource(node.data);
      if (!unit) {
        active.current = undefined;
        return;
      }
      const nodes = flow.getNodes();
      const members = new Map<string, Point>();
      for (const id of dragMembers(nodes, node.id)) {
        const member = nodes.find((entry) => entry.id === id);
        if (member) members.set(id, { ...member.position });
      }
      // 끌기가 시작될 때 노드는 이미 문턱만큼 움직였을 수 있다. 시작 위치는 store 에 남은 값(움직이기 전)이다.
      const before = flow.getNode(node.id)?.position ?? node.position;
      active.current = { unit, start: { ...before }, members };
      follow(node);
    };
    const onNodeDrag: OnNodeDrag<CanvasNode> = (_event, node) => follow(node);
    const onNodeDragStop: OnNodeDrag<CanvasNode> = (_event, node) => {
      const drag = active.current;
      if (!drag) return;
      follow(node);
      const previous = offsets.current.get(drag.unit) ?? { x: 0, y: 0 };
      offsets.current.set(drag.unit, {
        x: previous.x + node.position.x - drag.start.x,
        y: previous.y + node.position.y - drag.start.y,
      });
      active.current = undefined;
    };
    return { offsets, onNodeDragStart, onNodeDrag, onNodeDragStop };
  }, [flow]);
}
