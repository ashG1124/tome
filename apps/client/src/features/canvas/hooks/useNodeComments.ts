import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateNodeCommentRequestSchema,
  NodeCommentSchema,
  type CreateNodeCommentRequest,
  type NodeComment,
} from '@tome/shared';
import { newIdempotencyKey, useSessionStore } from '../../../shared/api';

export interface NodeCommentsApi {
  listComments: (answerId: string) => Promise<readonly NodeComment[]>;
  addComment: (
    answerId: string,
    body: CreateNodeCommentRequest,
    idempotencyKey: string,
  ) => Promise<NodeComment>;
  deleteComment: (commentId: string) => Promise<void>;
}
const commentsKey = (token: string | null, answerId: string) =>
  ['canvas-comments', token, answerId] as const;

/**
 * 노드 하나(또는 묶음 하나)의 코멘트. nodeIds 의 코멘트를 모두 보이고, 새 코멘트는 첫 id(묶음 첫 줄)에 쓴다(#241).
 * 같은 답변의 코멘트는 한 요청(같은 쿼리 키)을 나눠 쓴다.
 */
export function useNodeComments(
  answerId: string,
  nodeIds: string | readonly string[],
  api: NodeCommentsApi,
) {
  const ids: readonly string[] = typeof nodeIds === 'string' ? [nodeIds] : nodeIds;
  const nodeId = ids[0] ?? '';
  const client = useQueryClient();
  const token = useSessionStore((state) => state.token);
  const key = commentsKey(token, answerId);
  const keys = useRef(new Map<string, string>());
  const adding = useRef(false);
  const deleting = useRef(false);
  const query = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await api.listComments(answerId)).map((comment) => NodeCommentSchema.parse(comment)),
    retry: false,
  });
  const add = useMutation({
    mutationFn: async (input: {
      answerId: string;
      nodeId: string;
      body: string;
      key: string;
      token: string | null;
      signature: string;
    }) => {
      const comment = NodeCommentSchema.parse(
        await api.addComment(input.answerId, { nodeId: input.nodeId, body: input.body }, input.key),
      );
      if (comment.nodeId !== input.nodeId) throw new Error('Unexpected comment node');
      return comment;
    },
    onSuccess: (comment, input) => {
      client.setQueryData<NodeComment[]>(
        commentsKey(input.token, input.answerId),
        (previous = []) => [...previous.filter((entry) => entry.id !== comment.id), comment],
      );
      keys.current.delete(input.signature);
    },
  });
  const remove = useMutation({
    mutationFn: async (input: { id: string; answerId: string; token: string | null }) =>
      api.deleteComment(input.id),
    onSuccess: (_data, input) =>
      client.setQueryData<NodeComment[]>(
        commentsKey(input.token, input.answerId),
        (previous = []) => previous.filter((comment) => comment.id !== input.id),
      ),
  });
  const addError =
    add.variables?.answerId === answerId && add.variables.nodeId === nodeId
      ? (add.error ?? undefined)
      : undefined;
  const removeError =
    remove.variables?.answerId === answerId ? (remove.error ?? undefined) : undefined;
  return {
    comments: (query.data ?? [])
      .filter((comment) => ids.includes(comment.nodeId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
    loadError: query.error,
    loading: query.isPending,
    adding: add.isPending,
    deleting: remove.isPending,
    /** 지우는 중인 코멘트 id */
    removingId: remove.isPending ? remove.variables?.id : undefined,
    /** 저장 실패. 입력칸 바로 아래에 보인다. */
    addError,
    /** 삭제 실패. 목록 자리에 보인다. */
    removeError,
    error: query.error ?? addError ?? removeError,
    reload: () => void query.refetch(),
    submit: async (body: string) => {
      const parsed = CreateNodeCommentRequestSchema.safeParse({ nodeId, body });
      if (!parsed.success || adding.current) return;
      const signature = JSON.stringify([answerId, nodeId, parsed.data.body]);
      let idempotencyKey = keys.current.get(signature);
      if (!idempotencyKey) {
        idempotencyKey = newIdempotencyKey();
        keys.current.set(signature, idempotencyKey);
      }
      adding.current = true;
      try {
        return await add.mutateAsync({
          answerId,
          nodeId,
          body: parsed.data.body,
          key: idempotencyKey,
          token,
          signature,
        });
      } catch {
        return;
      } finally {
        adding.current = false;
      }
    },
    remove: async (id: string) => {
      if (
        deleting.current ||
        !query.data?.some(
          (comment) => comment.id === id && ids.includes(comment.nodeId) && comment.mine,
        )
      )
        return;
      deleting.current = true;
      try {
        await remove.mutateAsync({ id, answerId, token });
        return true;
      } catch {
        /* Mutation exposes the error. */
      } finally {
        deleting.current = false;
      }
    },
  };
}
