import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { Connection, Id, WorkspaceResponse } from '@tome/shared';
import { useCallback, useMemo, useState } from 'react';
import { api } from '../../../shared/api';

/**
 * 캔버스(#26)에 넘기는 리믹스 묶음. 혁준님과 맞춘 모양(2026-11-18):
 * 캔버스는 connection.nodeId 노드에 표시·말풍선·Apply 를 그리고, 처리 중 중복 클릭을 막는다.
 */
export interface CanvasRemix {
  /** 답변 id → 그 답변 노드에 붙일 Connection(숨긴 것은 뺀다) */
  connectionsByAnswer: Record<Id, Connection[]>;
  /** Apply: 고른 Connection 을 모아 둔다. 미리보기·확정은 편집 흐름(#31)이 appliedIdsFor 로 revise 에 실어 보낸다 */
  onApply: (answerId: Id, connection: Connection) => Promise<void>;
  /** 숨기기: 서버에 dismiss 하고 그 답변의 목록을 다시 받는다 */
  onDismiss: (answerId: Id, connection: Connection) => Promise<void>;
}

export interface RemixConnections extends CanvasRemix {
  /** 이 답변에서 Apply 로 고른 Connection id. revise 요청의 appliedConnectionIds 로 쓴다 */
  appliedIdsFor: (answerId: Id) => readonly Id[];
}

const connectionsKey = (answerId: Id, partnerId: Id) => ['connections', answerId, partnerId];

/** 받은 목록을 답변별로 묶고 숨긴(dismissed) 것은 뺀다. 아직 못 받은 답변은 빈 목록이다. */
export function groupConnections(
  answerIds: readonly Id[],
  lists: ReadonlyArray<readonly Connection[] | undefined>,
): Record<Id, Connection[]> {
  const grouped: Record<Id, Connection[]> = {};
  answerIds.forEach((answerId, index) => {
    grouped[answerId] = (lists[index] ?? []).filter((c) => c.status !== 'dismissed');
  });
  return grouped;
}

/** 지금 페이지 세트들의 최신 답변 id(답변이 아직 없는 세트는 뺀다). */
export function answerIdsOf(workspace: Pick<WorkspaceResponse, 'sets'>): Id[] {
  return workspace.sets.flatMap((set) => (set.latestAnswer ? [set.latestAnswer.id] : []));
}

/**
 * 리믹스 상대가 있을 때만 각 답변의 Connection 을 받아 캔버스 모양으로 묶는다. 상대가 없으면 undefined
 * (캔버스는 지금처럼 동작한다). 목록을 못 받은 답변은 Connection 없이 그린다(일반 생성은 그대로).
 */
export function useRemixConnections(
  workspace: WorkspaceResponse | undefined,
): RemixConnections | undefined {
  const queryClient = useQueryClient();
  const partnerId = workspace?.project.remixPartner?.id;
  const answerIds = useMemo(
    () => (workspace === undefined || partnerId === undefined ? [] : answerIdsOf(workspace)),
    [workspace, partnerId],
  );
  const lists = useQueries({
    queries: answerIds.map((answerId) => ({
      queryKey: connectionsKey(answerId, partnerId ?? ''),
      queryFn: () => api.listConnections(answerId),
      enabled: partnerId !== undefined,
    })),
  });
  // Apply 로 고른 것: 상대가 바뀌면 그 상대의 것만 보이도록 상대 id 를 같이 둔다
  const [applied, setApplied] = useState<Record<string, Id[]>>({});
  const appliedKey = (answerId: Id) => `${partnerId ?? ''}:${answerId}`;

  const onApply = useCallback(
    (answerId: Id, connection: Connection) => {
      const key = `${partnerId ?? ''}:${answerId}`;
      setApplied((all) => {
        const now = all[key] ?? [];
        return now.includes(connection.id) ? all : { ...all, [key]: [...now, connection.id] };
      });
      return Promise.resolve();
    },
    [partnerId],
  );

  const onDismiss = useCallback(
    async (answerId: Id, connection: Connection) => {
      await api.dismissConnection(connection.id);
      await queryClient.invalidateQueries({ queryKey: ['connections', answerId] });
    },
    [queryClient],
  );

  if (partnerId === undefined) return undefined;
  return {
    connectionsByAnswer: groupConnections(
      answerIds,
      lists.map((list) => list.data?.connections),
    ),
    onApply,
    onDismiss,
    appliedIdsFor: (answerId) => applied[appliedKey(answerId)] ?? [],
  };
}
