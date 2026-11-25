import { ConnectionSchema, type Connection, type CreatorSummary } from '@tome/shared';
import type { ConnectionApplyState } from './connection-apply';

/** 말풍선 왼쪽 사진에 쓰는 상대(이름·사진 주소). */
export type ConnectionPartner = Pick<CreatorSummary, 'displayName' | 'avatarUrl'>;

export interface CanvasRemixOptions {
  connectionsByAnswer: Record<string, Connection[]>;
  onApply: (answerId: string, connection: Connection) => Promise<void>;
  /** 이 Connection 을 낸 상대. 모르면(예: 예전 상대 것) undefined 이고 말풍선 사진 자리는 빈 동그라미다. */
  partnerFor?: (connection: Connection) => ConnectionPartner | undefined;
  /** 지금 상대가 낸 Connection 인지. 예전 상대 것은 서버가 Apply 를 거절한다. 없으면 모두 지금 상대 것으로 본다. */
  isCurrent?: (connection: Connection) => boolean;
  /** 캔버스가 채운다: 말풍선 Apply 상태. 없으면 Apply 를 잠근다(RC-04). */
  applyStateFor?: (answerId: string, connection: Connection) => ConnectionApplyState;
  /** 캔버스가 채운다: Apply → 그 세트의 편집 세션에서 노드 값을 바꾸고 미리보기를 만든다. */
  requestApply?: (answerId: string, connection: Connection) => void;
}

export function connectionsForNode(
  remix: CanvasRemixOptions | undefined,
  answerId: string | undefined,
  nodeId: string | undefined,
): Connection[] {
  if (!remix || !answerId || !nodeId) return [];
  const seen = new Set<string>();
  return (remix.connectionsByAnswer[answerId] ?? []).flatMap((value) => {
    const parsed = ConnectionSchema.safeParse(value);
    if (
      !parsed.success ||
      parsed.data.nodeId !== nodeId ||
      parsed.data.status === 'dismissed' ||
      seen.has(parsed.data.id)
    )
      return [];
    seen.add(parsed.data.id);
    return [parsed.data];
  });
}

/**
 * 카드 하나에 붙일 Connection 표시(최대 1개, #229).
 * - 여러 줄이 한 장 카드로 이어 붙은 묶음(검색 우선순위·검증 기준)은 첫 줄(카드 왼쪽 위)에만 붙이고, 묶음 안 모든 줄의 Connection 중에서 고른다.
 * - 바꿀 값이 없는 것(no-change, Apply 잠김)과 예전 상대 것(stale)은 표시하지 않는다.
 * nodeIds 는 그 카드가 대신하는 노드들(보통 자기 하나, 묶음 첫 줄이면 묶음 전체, 묶음 나머지 줄이면 빈 목록).
 */
export function connectionForCard(
  remix: CanvasRemixOptions | undefined,
  answerId: string | undefined,
  nodeIds: readonly string[],
): Connection | undefined {
  if (!remix || !answerId) return undefined;
  for (const nodeId of nodeIds)
    for (const connection of connectionsForNode(remix, answerId, nodeId)) {
      const state = remix.applyStateFor?.(answerId, connection);
      if (state === 'no-change' || state === 'stale') continue;
      if (remix.isCurrent && !remix.isCurrent(connection)) continue;
      return connection;
    }
  return undefined;
}
