import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  GetAnswerResponseSchema,
  type Answer,
  type AnswerSummary,
  type GetAnswerResponse,
  type PromptSet,
  type WorkspaceResponse,
} from '@tome/shared';
import { useSessionStore } from '../../../shared/api';

export interface AnswerHistoryApi {
  getAnswer: (answerId: string) => Promise<GetAnswerResponse>;
  setPinned: (answerId: string, pinned: boolean) => Promise<void>;
}

export function orderedAnswers(answers: readonly AnswerSummary[]): AnswerSummary[] {
  return [...answers].sort(
    (a, b) => (a.number ?? 0) - (b.number ?? 0) || a.createdAt.localeCompare(b.createdAt),
  );
}
const answerKey = (token: string | null, id: string) => ['canvas-answer', token, id] as const;

export function useAnswerHistory(
  projectId: string,
  sets: readonly PromptSet[],
  api?: AnswerHistoryApi,
) {
  const client = useQueryClient();
  const token = useSessionStore((state) => state.token);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const requests = useRef(new Map<string, number>());
  const pinLock = useRef(false);
  useEffect(() => {
    requests.current.clear();
  }, [token]);
  useEffect(() => {
    for (const set of sets)
      if (set.latestAnswer)
        client.setQueryData(answerKey(token, set.latestAnswer.id), set.latestAnswer);
  }, [sets, token, client]);
  const queries = useQueries({
    queries: api
      ? sets.map((set) => {
          const answers = orderedAnswers(set.answers);
          const id = answers.some((answer) => answer.id === selected[set.id])
            ? selected[set.id]!
            : (set.latestAnswer?.id ?? answers.at(-1)?.id);
          return {
            queryKey: answerKey(token, id ?? ''),
            queryFn: async () => {
              const result = GetAnswerResponseSchema.parse(await api.getAnswer(id!)).answer;
              if (result.id !== id || result.setId !== set.id || result.status !== 'accepted')
                throw new Error('Unexpected answer');
              return result;
            },
            initialData:
              set.latestAnswer && set.latestAnswer.id === id ? set.latestAnswer : undefined,
            enabled: !!id,
            staleTime: Infinity,
          };
        })
      : [],
  });
  const selection = useMutation({
    mutationFn: async ({ setId, answerId }: { setId: string; answerId: string }) => {
      const set = sets.find((entry) => entry.id === setId);
      if (!api || !set || !orderedAnswers(set.answers).some((answer) => answer.id === answerId))
        return;
      const revision = (requests.current.get(setId) ?? 0) + 1;
      requests.current.set(setId, revision);
      await client.fetchQuery({
        queryKey: answerKey(token, answerId),
        staleTime: 0,
        queryFn: async () => {
          const answer = GetAnswerResponseSchema.parse(await api.getAnswer(answerId)).answer;
          if (answer.id !== answerId || answer.setId !== setId || answer.status !== 'accepted')
            throw new Error('Unexpected answer');
          return answer;
        },
      });
      if (requests.current.get(setId) === revision)
        setSelected((previous) => ({ ...previous, [setId]: answerId }));
    },
  });
  const pin = useMutation({
    mutationFn: async ({
      answerId,
      pinned,
    }: {
      answerId: string;
      pinned: boolean;
      token: string | null;
      projectId: string;
    }) => {
      await api!.setPinned(answerId, pinned);
    },
    onSuccess: (_data, { answerId, pinned, token: requestToken, projectId: requestProject }) => {
      client.setQueryData<Answer>(answerKey(requestToken, answerId), (answer) =>
        answer ? { ...answer, pinned } : answer,
      );
      if (useSessionStore.getState().token !== requestToken) return;
      client.setQueriesData<WorkspaceResponse>(
        { queryKey: ['workspace', requestProject] },
        (workspace) =>
          workspace
            ? {
                ...workspace,
                sets: workspace.sets.map((set) => ({
                  ...set,
                  latestAnswer:
                    set.latestAnswer?.id === answerId
                      ? { ...set.latestAnswer, pinned }
                      : set.latestAnswer,
                  answers: set.answers.map((answer) =>
                    answer.id === answerId ? { ...answer, pinned } : answer,
                  ),
                })),
              }
            : workspace,
      );
    },
  });
  const displayed = sets.map((set, index) => ({
    ...set,
    latestAnswer: api ? (queries[index]?.data ?? set.latestAnswer) : set.latestAnswer,
  }));
  return {
    resetSelection: (setId: string) =>
      setSelected((previous) => {
        const next = { ...previous };
        delete next[setId];
        return next;
      }),
    sets: displayed,
    select: (setId: string, answerId: string) => selection.mutate({ setId, answerId }),
    selectingSet: selection.isPending ? selection.variables?.setId : undefined,
    error: selection.error ?? pin.error ?? queries.find((query) => query.error)?.error,
    pinning: pin.isPending,
    togglePin: async (answerId: string, pinned: boolean) => {
      if (
        !api ||
        pinLock.current ||
        !sets.some((set) => set.answers.some((answer) => answer.id === answerId))
      )
        return;
      const cached = client.getQueryData<Answer>(answerKey(token, answerId));
      if (cached && cached.status !== 'accepted') return;
      pinLock.current = true;
      try {
        await pin.mutateAsync({ answerId, pinned, token, projectId });
      } catch {
        /* Mutation exposes the error. */
      } finally {
        pinLock.current = false;
      }
    },
  };
}
