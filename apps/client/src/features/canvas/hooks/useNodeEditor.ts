import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  AcceptAnswerResponse,
  Answer,
  GetJobResponse,
  Job,
  JobStep,
  Node,
  NodeSnapshot,
} from '@tome/shared';
import type { QueryClient } from '@tanstack/react-query';
import { api, ApiRequestError, newIdempotencyKey } from '../../../shared/api';
import { runGeneration } from '../generation-runner';
import {
  reorderPriorities,
  replaceEditedNode,
  restoreNode,
  sameEditableValues,
} from '../edit-model';
import { usePreviewScheduler } from './use-preview-scheduler';

export interface NodeEditorOptions {
  base: Answer;
  requestPreview: (snapshot: NodeSnapshot, signal: AbortSignal) => Promise<Answer>;
  acceptPreview: (answerId: string) => Promise<AcceptAnswerResponse>;
  onAccepted: (answer: Answer) => void;
}

export function useNodeEditor({
  base,
  requestPreview,
  acceptPreview,
  onAccepted,
}: NodeEditorOptions) {
  const [snapshot, setSnapshot] = useState(() => structuredClone(base.nodes));
  const current = useRef(snapshot);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<unknown>();
  const [stacked, setStacked] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  const scheduler = usePreviewScheduler(requestPreview);
  const { cancel, schedule, state } = scheduler;
  const ready = useRef<Answer | undefined>(undefined);
  useLayoutEffect(() => {
    ready.current = state.status === 'ready' ? state.answer : undefined;
  }, [state]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const update = useCallback(
    (next: NodeSnapshot) => {
      if (locked.current || base.status !== 'accepted' || sameEditableValues(next, current.current))
        return;
      current.current = next;
      ready.current = undefined;
      setSnapshot(next);
      setApplyError(undefined);
      setStacked(false);
      if (sameEditableValues(next, base.nodes)) cancel();
      else schedule(next);
    },
    [base, cancel, schedule],
  );

  const edit = useCallback(
    (node: Node) => update(replaceEditedNode(current.current, node)),
    [update],
  );
  const reorder = useCallback(
    (source: string, target: string) => update(reorderPriorities(current.current, source, target)),
    [update],
  );
  const reset = useCallback(
    (id: string) => {
      const original = base.nodes.nodes.find((node) => node.id === id);
      const node = current.current.nodes.find((entry) => entry.id === id);
      if (original && node) {
        const restored = restoreNode(node, original);
        if (node.kind === 'priority') {
          const initial = base.nodes.nodes
            .filter((entry) => entry.kind === 'priority')
            .sort(
              (a, b) => (a.aiInitial?.order ?? a.order ?? 0) - (b.aiInitial?.order ?? b.order ?? 0),
            );
          const currentOrder = current.current.nodes
            .filter((entry) => entry.kind === 'priority')
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          const target = currentOrder[initial.findIndex((entry) => entry.id === id)];
          const reordered = target
            ? reorderPriorities(current.current, id, target.id)
            : current.current;
          update(
            replaceEditedNode(reordered, {
              ...restored,
              order: reordered.nodes.find((entry) => entry.id === id)?.order,
            }),
          );
        } else edit(restored);
      }
    },
    [base, edit, update],
  );

  const apply = useCallback(async () => {
    const draft = ready.current;
    if (
      locked.current ||
      !draft ||
      draft.status !== 'draft' ||
      draft.setId !== base.setId ||
      draft.baseAnswerId !== base.id
    )
      return;
    locked.current = true;
    setApplying(true);
    setApplyError(undefined);
    try {
      const { answer } = await acceptPreview(draft.id);
      if (!mounted.current) return;
      if (answer.id !== draft.id) throw new Error('Unexpected accepted answer');
      ready.current = undefined;
      cancel();
      setStacked(true);
      onAccepted({ ...draft, ...answer });
    } catch (error) {
      if (mounted.current) {
        setApplyError(error);
        if (error instanceof ApiRequestError && error.code === 'NOT_DRAFT') {
          ready.current = undefined;
          cancel();
        }
      }
    } finally {
      locked.current = false;
      if (mounted.current) setApplying(false);
    }
  }, [acceptPreview, base.id, base.setId, onAccepted, cancel]);

  return {
    snapshot,
    edit,
    reorder,
    reset,
    apply,
    applying,
    applyError,
    stacked,
    preview: scheduler.state,
    canApply:
      scheduler.canApply &&
      !applying &&
      base.status === 'accepted' &&
      state.status === 'ready' &&
      state.answer.status === 'draft' &&
      state.answer.setId === base.setId &&
      state.answer.baseAnswerId === base.id,
    retryPreview: scheduler.retry,
  };
}

export function createEditorRequests(base: Answer, client: QueryClient) {
  let queue: Promise<unknown> = Promise.resolve();
  let attempt:
    | {
        snapshot: string;
        key: string;
        job?: Job;
        steps: JobStep[];
      }
    | undefined;
  const acceptKeys = new Map<string, string>();
  const abort = () => new DOMException('Aborted', 'AbortError');
  const cacheJob = (job: Job, steps: JobStep[]) => {
    client.setQueryData<GetJobResponse>(['generation', 'revision', job.id], { job, steps });
    client.setQueryData(['revision-preview', base.id], { job, steps });
  };
  return {
    preview: async (nodes: NodeSnapshot, signal: AbortSignal): Promise<Answer> => {
      if (signal.aborted) throw abort();
      const snapshot = JSON.stringify(nodes);
      if (!attempt || attempt.snapshot !== snapshot) {
        attempt = { snapshot, key: newIdempotencyKey(), steps: [] };
      }
      const current = attempt;
      const cancel = () => {
        if (attempt === current) attempt = undefined;
        if (current.job) void api.cancelJob(current.job.id).catch(() => {});
      };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        if (!current.job) {
          client.setQueryData(['revision-preview', base.id], null);
          const creation = queue
            .catch(() => {})
            .then(async () => {
              if (signal.aborted) throw abort();
              const response = await api.createRevision(
                base.setId,
                { baseAnswerId: base.id, nodes },
                current.key,
              );
              current.job = response.job;
              if (signal.aborted) {
                cancel();
                throw abort();
              }
              cacheJob(response.job, []);
            });
          queue = creation;
          await creation;
        } else {
          const loaded = await client.fetchQuery({
            queryKey: ['generation', 'revision', current.job.id],
            queryFn: () => api.getJob(current.job!.id),
            staleTime: 0,
          });
          current.job = loaded.job;
          current.steps = loaded.steps;
        }
        if (signal.aborted) throw abort();
        let failure: unknown;
        await runGeneration({
          job: current.job!,
          signal,
          advance: api.advanceJob,
          onStep: ({ job, step }) => {
            current.job = job;
            current.steps = [...current.steps.filter((entry) => entry.stage !== step.stage), step];
            cacheJob(job, current.steps);
          },
          onError: (_stage, error) => {
            failure = error;
          },
        });
        if (signal.aborted) throw abort();
        if (failure) throw failure;
        const answer = current.steps.find((step) => step.answer)?.answer;
        if (
          current.job?.status !== 'succeeded' ||
          answer?.status !== 'draft' ||
          answer.setId !== base.setId ||
          answer.baseAnswerId !== base.id
        ) {
          throw new ApiRequestError(409, {
            code: 'JOB_CLOSED',
            message: 'Preview job closed',
            retryable: false,
          });
        }
        const verification = current.steps.find((step) => step.verification)?.verification;
        const result = verification ? { ...answer, verification } : answer;
        client.setQueryData(['answer', result.id], result);
        return result;
      } finally {
        signal.removeEventListener('abort', cancel);
      }
    },
    accept: (answerId: string) => {
      let key = acceptKeys.get(answerId);
      if (!key) {
        key = newIdempotencyKey();
        acceptKeys.set(answerId, key);
      }
      return api.acceptAnswer(answerId, key);
    },
  };
}
