import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { Connection, NodeSnapshot, PromptSet } from '@tome/shared';
import { connectionApplyState } from '../connection-apply';
import { canEditNode } from '../edit-model';
import type { CanvasRemixOptions } from '../remix-model';

/** 편집 세션이 받아서 노드 값에 반영할 Apply 한 건. */
export interface PendingConnectionApply {
  setId: string;
  /** Apply 할 때의 최신 확정 버전. 버전이 바뀌면(확정·버전 이동) 버린다 */
  answerId: string;
  nodeId: string;
  predictedAction: string;
}

interface ConnectionApplyOptions {
  sets: readonly PromptSet[];
  remix: CanvasRemixOptions | undefined;
  /** 지금 편집 세션이 붙은 세트 */
  sessionSet: string | undefined;
  /** 편집 세션의 고친 값(Apply the fix 전) */
  draft: { setId: string; nodes: NodeSnapshot['nodes'] } | undefined;
  /** 생성·확정 중이면 true(Apply 를 잠근다) */
  blocked: boolean;
  /** 그 세트로 편집 세션을 연다(다른 세트의 고친 값은 버린다) */
  start: (setId: string) => void;
}

/**
 * 리믹스 Connection Apply(#151) 연결. 말풍선 Apply → 그 세트 편집 세션을 열고 노드 값을 바꾼다(규칙은 connection-apply.ts)
 * → 미리보기(revise 에 appliedConnectionIds) → Apply the fix 로 새 버전. 확정 뒤 서버가 Connection 을 applied 로 바꾼다.
 * 세션 동안 Apply 한 Connection 은 "Applied" 로 보이고 다시 누를 수 없다. 상대를 바꾸면 예전 상대 것은 revise 에서 뺀다.
 */
export function useConnectionApply({
  sets,
  remix,
  sessionSet,
  draft,
  blocked,
  start,
}: ConnectionApplyOptions) {
  const [applied, setApplied] = useState<{ setId: string; answerId: string; ids: string[] }>();
  const [pending, setPending] = useState<PendingConnectionApply>();
  const isCurrent = (connection: Connection) => remix?.isCurrent?.(connection) ?? true;
  const all = remix ? Object.values(remix.connectionsByAnswer).flat() : [];
  // 세션이 끝나거나(세트가 바뀜) 새 버전이 확정되면(최신 버전이 바뀜) 이번 Apply 기록은 저절로 무효가 된다
  const live = (entry: { setId: string; answerId: string } | undefined) =>
    entry !== undefined &&
    entry.setId === sessionSet &&
    sets.find((set) => set.id === entry.setId)?.latestAnswer?.id === entry.answerId;
  const sessionIds = applied && live(applied) ? applied.ids : [];
  // revise 에 실을 id: 지금 상대 것만 남긴다(Apply 직후 상대를 바꾸면 예전 것은 서버가 거절한다)
  const liveIds = sessionIds.filter((id) => {
    const connection = all.find((entry) => entry.id === id);
    return connection !== undefined && isCurrent(connection);
  });
  const ids = useRef<readonly string[]>(liveIds);
  useLayoutEffect(() => {
    ids.current = liveIds;
  });
  const appliedIds = useCallback(() => ids.current, []);
  const done = useCallback(() => setPending(undefined), []);
  const setOf = (answerId: string) => sets.find((set) => set.latestAnswer?.id === answerId);

  const wrapped: CanvasRemixOptions | undefined = remix && {
    ...remix,
    applyStateFor: (answerId, connection) => {
      const set = setOf(answerId);
      const base = set?.latestAnswer;
      const node = base?.nodes.nodes.find((entry) => entry.id === connection.nodeId);
      const snapshot =
        set && base?.status === 'accepted'
          ? draft?.setId === set.id
            ? { ...base.nodes, nodes: draft.nodes }
            : base.nodes
          : undefined;
      return connectionApplyState({
        connection,
        current: isCurrent(connection),
        appliedNow: !!set && set.id === sessionSet && sessionIds.includes(connection.id),
        editable: !blocked && !!node && canEditNode(node),
        snapshot,
      });
    },
    requestApply: (answerId, connection) => {
      const set = setOf(answerId);
      if (!set) return;
      start(set.id);
      setApplied((previous) => ({
        setId: set.id,
        answerId,
        ids: [
          ...(previous?.setId === set.id && previous.answerId === answerId ? previous.ids : []),
          connection.id,
        ].filter((id, index, list) => list.indexOf(id) === index),
      }));
      setPending({
        setId: set.id,
        answerId,
        nodeId: connection.nodeId,
        predictedAction: connection.predictedAction,
      });
    },
  };

  return {
    remix: wrapped,
    /** revise 에 실을 Connection id(편집 세션이 미리보기를 만들 때 읽는다) */
    appliedIds,
    /** 지금 세션이 반영할 Apply. 반영하면 done 을 부른다 */
    pending: live(pending) ? pending : undefined,
    done,
  };
}
