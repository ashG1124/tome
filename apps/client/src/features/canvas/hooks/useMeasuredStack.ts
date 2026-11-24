import { useEffect } from 'react';
import { useReactFlow, useStore, type Edge } from '@xyflow/react';
import { stackColumn, type CanvasNode, type ColumnEntry } from '../model';

/** 단계 열(1~5단계). 프롬프트 열(0)과 답변 열(6)은 다시 쌓지 않는다. */
const isStageColumn = (column: number) => column >= 1 && column <= 5;

/**
 * 노드가 그려진 뒤 실제 높이로 단계 열을 다시 쌓아 노드 사이 간격을 일정하게 둔다(#215).
 * 처음 배치(buildCanvas)는 글자 수로 높이를 어림하므로 긴 글·여러 줄 노드에서 간격이 어긋난다.
 * 노드를 제자리에서 펼친 동안(openId)은 useOpenShift 가 아래 노드를 밀고 있으니 건드리지 않는다.
 */
export function useMeasuredStack(openId: string | undefined) {
  const flow = useReactFlow<CanvasNode, Edge>();
  // 단계 열 노드들의 측정 높이를 한 줄 문자열로 묶어, 높이가 바뀔 때만 다시 쌓는다.
  const heights = useStore((state) => {
    let key = '';
    for (const node of state.nodeLookup.values()) {
      if (!isStageColumn((node.data as CanvasNode['data']).column)) continue;
      key += `${node.id}:${Math.round(node.measured.height ?? 0)}|`;
    }
    return key;
  });
  useEffect(() => {
    if (openId || !heights) return;
    const columns = new Map<string, ColumnEntry[]>();
    for (const node of flow.getNodes()) {
      const { data } = node;
      if (!isStageColumn(data.column)) continue;
      // 단계 알약은 열 맨 위에 고정이다.
      if (data.kind === 'heading' && data.variant === 'step') continue;
      const height = flow.getInternalNode(node.id)?.measured.height ?? 0;
      // 아직 재지 않은 노드가 있으면 그 열은 다음 측정 때 쌓는다.
      const key = `${data.setId}:${data.column}`;
      const list = columns.get(key) ?? [];
      list.push({
        id: node.id,
        y: node.position.y,
        height,
        kind: data.kind === 'heading' ? 'heading' : 'card',
        row: data.output?.kind === 'priority' || data.output?.kind === 'criterion',
        groupPosition: data.groupPosition,
      });
      columns.set(key, list);
    }
    for (const entries of columns.values()) {
      if (entries.some((entry) => entry.height <= 0)) continue;
      for (const [id, y] of stackColumn(entries)) {
        flow.updateNode(id, (node) => ({ position: { x: node.position.x, y } }));
      }
    }
  }, [heights, openId, flow]);
}
