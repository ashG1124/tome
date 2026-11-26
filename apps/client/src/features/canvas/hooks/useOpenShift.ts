import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useReactFlow, useStore, useStoreApi, type Edge } from '@xyflow/react';
import type { CanvasNode } from '../model';
import { openRole, type CanvasEditorSelection } from '../navigation';

/** 펼친 카드 하나가 펼치기 전에 차지하던 자리. */
export interface ClosedBox {
  anchor: string;
  setId: string;
  column: number;
  covered: ReadonlySet<string>;
  /** 펼치기 전 높이: 카드 위끝에서 카드(와 덮인 줄) 아래끝까지 */
  extent: number;
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

/** 펼치기 전 자리를 잰다. 측정값이 아직 닫힌 크기일 때(펼친 그 렌더)에 불러야 한다. */
export function closedBox(
  anchor: CanvasNode,
  covered: readonly CanvasNode[],
  heightOf: (id: string) => number,
): ClosedBox {
  // 같은 묶음의 줄은 늘 함께 움직이므로, 줄 사이 거리는 다른 카드가 밀어 둔 양과 상관없다.
  const bottom = Math.max(
    ...[anchor, ...covered].map((node) => node.position.y + heightOf(node.id)),
  );
  return {
    anchor: anchor.id,
    setId: anchor.data.setId,
    column: anchor.data.column,
    covered: new Set(covered.map((node) => node.id)),
    extent: bottom - anchor.position.y,
  };
}

/**
 * 펼친 카드들이 같은 단계 열의 아래 노드를 얼마나 밀어 내려야 하는지 계산한다(노드 id → 내릴 거리).
 * 아래인지는 "밀기 전 자리"(지금 y − 이미 민 거리 applied)로 견준다. 그래서 여러 카드를 함께 펼쳐도,
 * 펼친 카드 바로 아래 카드를 이어서 펼쳐도 밀어낸 양이 서로 섞이지 않는다(#261).
 * 한 노드 위에 펼친 카드가 여럿이면 그만큼 더해서 민다.
 */
export function openShifts(
  nodes: readonly CanvasNode[],
  boxes: Iterable<ClosedBox>,
  heightOf: (id: string) => number,
  applied: ReadonlyMap<string, number>,
): Map<string, number> {
  const base = (node: CanvasNode) => node.position.y - (applied.get(node.id) ?? 0);
  const target = new Map<string, number>();
  for (const box of boxes) {
    const anchor = nodes.find((node) => node.id === box.anchor);
    const height = heightOf(box.anchor);
    if (!anchor || height <= 0) continue;
    const delta = Math.max(0, Math.round(height - box.extent));
    if (delta <= 0) continue;
    const bottom = base(anchor) + box.extent;
    for (const node of nodes) {
      if (
        node.id === box.anchor ||
        box.covered.has(node.id) ||
        node.data.setId !== box.setId ||
        node.data.column !== box.column
      )
        continue;
      if (base(node) >= bottom - 1) target.set(node.id, (target.get(node.id) ?? 0) + delta);
    }
  }
  return target;
}

/**
 * 노드를 제자리에서 펼치면 같은 단계 열에서 그 아래 노드를 펼친 높이만큼 밀어 내린다. 여러 노드를 함께 펼쳐 둘 수 있다.
 * 펼침 애니메이션 동안 카드 높이가 바뀔 때마다(React Flow 측정값) 따라 움직여서, 아래 노드가 함께 부드럽게 밀린다.
 * 접으면 밀었던 만큼 되돌린다. 사용자가 끌어서 옮긴 위치는 그대로 두고 밀어낸 양만 더하고 뺀다.
 * 돌려주는 값은 펼친 카드의 노드 id(연 순서)다.
 */
export function useOpenShift(selected: readonly CanvasEditorSelection[] | undefined): string[] {
  const flow = useReactFlow<CanvasNode, Edge>();
  const store = useStoreApi<CanvasNode, Edge>();
  const applied = useRef<ReadonlyMap<string, number>>(new Map());
  const boxes = useRef(new Map<string, ClosedBox>());
  const key = (selected ?? [])
    .map((entry) => `${entry.setId}:${entry.nodeId}:${entry.kind ?? ''}`)
    .join('|');
  // 선택이 바뀐 그 렌더 결과로 펼칠 카드를 찾는다.
  const anchorIds = useMemo(() => {
    const nodes = flow.getNodes();
    const ids: string[] = [];
    for (const entry of selected ?? []) {
      const id = openTargets(nodes, entry).anchor?.id;
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 선택(key)이 바뀔 때만 다시 찾는다.
  }, [key, flow]);
  const heights = useStore((state) =>
    anchorIds.map((id) => state.nodeLookup.get(id)?.measured.height ?? 0).join('|'),
  );

  /**
   * 밀어낸 양을 지금 펼친 카드들에 맞춘다. 위치를 읽고 고치는 일을 React Flow 의 노드 갱신 한 번 안에서 한다.
   * 그 안에서는 앞서 예약된 이동이 모두 반영된 위치를 받으므로, 밀기 전 자리를 틀리게 세지 않는다
   * (밖에서 읽으면 방금 되돌린 이동이 아직 반영되지 않은 위치가 와서, 이어서 펼친 카드 아래 노드가 밀리지 않았다).
   */
  const sync = useCallback(() => {
    if (boxes.current.size === 0 && applied.current.size === 0) return;
    flow.setNodes((nodes) => {
      const lookup = store.getState().nodeLookup;
      const target = openShifts(
        nodes,
        boxes.current.values(),
        (id) => lookup.get(id)?.measured.height ?? 0,
        applied.current,
      );
      let changed = false;
      const next = nodes.map((node) => {
        const move = (target.get(node.id) ?? 0) - (applied.current.get(node.id) ?? 0);
        if (move === 0) return node;
        changed = true;
        return { ...node, position: { x: node.position.x, y: node.position.y + move } };
      });
      applied.current = target;
      return changed ? next : nodes;
    });
  }, [flow, store]);

  // 펼친 카드가 바뀌면 새로 펼친 카드의 펼치기 전 자리를 재고(아직 측정값은 닫힌 크기다), 접은 카드의 자리는 버린다.
  useLayoutEffect(() => {
    const nodes = flow.getNodes();
    const lookup = store.getState().nodeLookup;
    const next = new Map<string, ClosedBox>();
    for (const entry of selected ?? []) {
      const { anchor, covered } = openTargets(nodes, entry);
      if (!anchor || next.has(anchor.id)) continue;
      next.set(
        anchor.id,
        boxes.current.get(anchor.id) ??
          closedBox(anchor, covered, (id) => lookup.get(id)?.measured.height ?? 0),
      );
    }
    boxes.current = next;
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 펼친 카드가 바뀔 때만 잰다.
  }, [anchorIds]);

  // 펼친 카드의 측정 높이가 바뀔 때마다(펼침·접힘 애니메이션, 탭 전환) 다시 민다.
  useEffect(() => {
    sync();
  }, [heights, sync]);

  return anchorIds;
}
