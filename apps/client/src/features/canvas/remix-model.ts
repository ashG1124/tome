import { ConnectionSchema, type Connection, type CreatorSummary } from '@tome/shared';
import type { ConnectionApplyState } from './connection-apply';

/** 말풍선 왼쪽 사진에 쓰는 상대(이름·사진 주소). */
export type ConnectionPartner = Pick<CreatorSummary, 'displayName' | 'avatarUrl'>;

export interface CanvasRemixOptions {
  connectionsByAnswer: Record<string, Connection[]>;
  onApply: (answerId: string, connection: Connection) => Promise<void>;
  onDismiss: (answerId: string, connection: Connection) => Promise<void>;
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
