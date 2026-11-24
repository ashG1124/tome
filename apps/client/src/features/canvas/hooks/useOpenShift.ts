import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useReactFlow, useStore, type Edge } from '@xyflow/react';
import type { CanvasNode } from '../model';
import { openRole, type CanvasEditorSelection } from '../navigation';

interface ClosedBox {
  anchor: string;
  setId: string;
  column: number;
  covered: Set<string>;
  /** 펼치기 전 카드(와 덮인 줄) 아래끝 y */
  bottom: number;
}

/** 고른 노드에서 펼쳐질 카드(anchor)와 그 카드가 덮는 같은 묶음 줄을 찾는다. */
export function openTargets(nodes: readonly CanvasNode[], selected?: CanvasEditorSelection) {
  let anchor: CanvasNode | undefined;
  const covered: CanvasNode[] = [];
  for (const node of nodes) {
    const role = openRole(selected, node.data.setId, node.data.output, node.data.groupPosition);
    if (role === 'open') anchor = node;
    else if (role === 'covered') covered.push(node);
  }
  return { anchor, covered };
}

/**
 * 노드를 제자리에서 펼치면 같은 단계 열에서 그 아래 노드를 펼친 높이만큼 밀어 내린다.
 * 펼침 애니메이션 동안 카드 높이가 바뀔 때마다(React Flow 측정값) 따라 움직여서, 아래 노드가 함께 부드럽게 밀린다.
 * 접으면 밀었던 만큼 되돌린다. 사용자가 끌어서 옮긴 위치는 그대로 두고 밀어낸 양만 더하고 뺀다.
 */
export function useOpenShift(selected: CanvasEditorSelection | undefined) {
  const flow = useReactFlow<CanvasNode, Edge>();
  const applied = useRef(new Map<string, number>());
  const closed = useRef<ClosedBox | null>(null);
  const key = selected ? `${selected.setId}:${selected.nodeId}:${selected.kind ?? ''}` : '';
  // 선택이 바뀐 그 렌더 결과로 펼칠 카드를 찾는다.
  const anchorId = useMemo(
    () => (selected ? openTargets(flow.getNodes(), selected).anchor?.id : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 선택(key)이 바뀔 때만 다시 찾는다.
    [key, flow],
  );
  const height = useStore((state) =>
    anchorId ? (state.nodeLookup.get(anchorId)?.measured.height ?? 0) : 0,
  );

  const apply = (target: Map<string, number>) => {
    const ids = new Set([...applied.current.keys(), ...target.keys()]);
    for (const id of ids) {
      const next = target.get(id) ?? 0;
      const previous = applied.current.get(id) ?? 0;
      if (next === previous || !flow.getNode(id)) continue;
      flow.updateNode(id, (node) => ({
        position: { x: node.position.x, y: node.position.y + next - previous },
      }));
    }
    applied.current = target;
  };

  // 펼칠 카드가 바뀌면 이전에 밀어 둔 노드를 먼저 되돌리고, 펼치기 전 아래끝을 잰다(아직 측정값은 닫힌 크기다).
  useLayoutEffect(() => {
    apply(new Map());
    closed.current = null;
    if (!anchorId || !selected) return;
    const nodes = flow.getNodes();
    const { anchor, covered } = openTargets(nodes, selected);
    if (!anchor) return;
    const members = [anchor, ...covered];
    const bottom = Math.max(
      ...members.map((node) => node.position.y + (node.measured?.height ?? 0)),
    );
    closed.current = {
      anchor: anchor.id,
      setId: anchor.data.setId,
      column: anchor.data.column,
      covered: new Set(covered.map((node) => node.id)),
      bottom,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 펼칠 카드가 바뀔 때만 잰다.
  }, [anchorId]);

  useEffect(() => {
    const box = closed.current;
    const anchor = box ? flow.getNode(box.anchor) : undefined;
    if (!box || !anchor || height <= 0) return;
    const delta = Math.max(0, Math.round(anchor.position.y + height - box.bottom));
    const target = new Map<string, number>();
    if (delta > 0) {
      for (const node of flow.getNodes()) {
        if (
          node.id === box.anchor ||
          box.covered.has(node.id) ||
          node.data.setId !== box.setId ||
          node.data.column !== box.column
        )
          continue;
        const baseY = node.position.y - (applied.current.get(node.id) ?? 0);
        if (baseY >= box.bottom - 1) target.set(node.id, delta);
      }
    }
    apply(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 측정 높이가 바뀔 때마다 다시 민다.
  }, [height, anchorId]);

  return anchorId;
}
