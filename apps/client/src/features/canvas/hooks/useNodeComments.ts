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

/** 답변 하나의 코멘트 전체. 같은 키를 쓰므로 코멘트 창과 요청 한 번을 나눠 쓴다. 노드 옆 코멘트 띠가 읽는다. */
export function useAnswerComments(
  answerId: string,
  api: Pick<NodeCommentsApi, 'listComments'>,
  enabled = true,
) {
  const token = useSessionStore((state) => state.token);
  return useQuery({
    queryKey: commentsKey(token, answerId),
    queryFn: async () =>
      (await api.listComments(answerId)).map((comment) => NodeCommentSchema.parse(comment)),
    retry: false,
    enabled,
  });
}

export function useNodeComments(answerId: string, nodeId: string, api: NodeCommentsApi) {
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
      .filter((comment) => comment.nodeId === nodeId)
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
          (comment) => comment.id === id && comment.nodeId === nodeId && comment.mine,
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
