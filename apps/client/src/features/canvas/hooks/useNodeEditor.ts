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

/**
 * 편집 기록의 한 칸. 맨 앞 칸은 고치기 전 값이고(미리보기 없음), 그 뒤는 값을 고칠 때마다 한 칸씩 생긴다.
 * answer 는 그 값으로 만든 미리보기다(아직 만들지 않았거나 실패했으면 없다).
 */
interface EditStep {
  snapshot: NodeSnapshot;
  answer?: Answer;
}

interface EditHistory {
  steps: readonly EditStep[];
  index: number;
}

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
  // 편집 기록(Preview 이전/다음, #261). 화면에 그릴 값(state)과 콜백에서 바로 읽을 값(ref)을 함께 둔다.
  const [history, setHistory] = useState<EditHistory>(() => ({
    steps: [{ snapshot: base.nodes }],
    index: 0,
  }));
  const trail = useRef(history);
  const commit = useCallback((next: EditHistory) => {
    trail.current = next;
    setHistory(next);
  }, []);
  // 서버에 살아 있는 미리보기(draft). 세트마다 하나뿐이라, 새 미리보기가 만들어지면 앞의 것은 버려진다.
  const live = useRef<string | undefined>(undefined);
  /** 미리보기를 만들고, 다 만들면 지금 칸에 붙여 둔다. 그 사이 값이 또 바뀌었으면(취소됨) 붙이지 않는다. */
  const request = useCallback(
    async (input: NodeSnapshot, signal: AbortSignal) => {
      const answer = await requestPreview(input, signal);
      if (signal.aborted) return answer;
      live.current = answer.id;
      const { steps, index } = trail.current;
      const here = steps[index];
      if (here && sameEditableValues(here.snapshot, input))
        commit({
          steps: steps.map((step, at) => (at === index ? { ...step, answer } : step)),
          index,
        });
      return answer;
    },
    [requestPreview, commit],
  );
  const scheduler = usePreviewScheduler(request);
  const { cancel, schedule, show, state } = scheduler;
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

  /**
   * 그 칸의 값에 맞는 미리보기 상태로 맞춘다. 고치기 전 값이면 미리보기가 없고, 그 칸의 미리보기가 아직 서버에
   * 살아 있으면 그대로 보이고(Apply 할 수 있다), 이미 버려졌으면 같은 값으로 다시 만든다.
   */
  const settle = useCallback(
    (step: EditStep) => {
      if (sameEditableValues(step.snapshot, base.nodes)) cancel();
      else if (step.answer && step.answer.id === live.current) show(step.snapshot, step.answer);
      else schedule(step.snapshot);
    },
    [base, cancel, schedule, show],
  );

  const update = useCallback(
    (next: NodeSnapshot) => {
      if (locked.current || base.status !== 'accepted' || sameEditableValues(next, current.current))
        return;
      current.current = next;
      ready.current = undefined;
      setSnapshot(next);
      setApplyError(undefined);
      setStacked(false);
      // 기록: 지금 칸 뒤(다음으로 갈 수 있던 칸)는 버린다. 미리보기를 만들기 전에 이어서 고친 값은 한 칸으로 친다.
      const { steps, index } = trail.current;
      const pending = index > 0 && !steps[index]?.answer;
      const kept = steps.slice(0, pending ? index : index + 1);
      const last = kept[kept.length - 1];
      if (last && sameEditableValues(last.snapshot, next)) {
        // 손으로 바로 앞 칸의 값으로 되돌렸다. 새 칸을 만들지 않고 그 칸으로 간다.
        commit({ steps: kept, index: kept.length - 1 });
        settle(last);
        return;
      }
      const step = { snapshot: next };
      commit({ steps: [...kept, step], index: kept.length });
      settle(step);
    },
    [base, commit, settle],
  );

  /** 기록의 다른 칸으로 간다. 노드 값이 그 칸의 값으로 돌아간다(Preview 이전/다음, #261). */
  const go = useCallback(
    (index: number) => {
      const { steps, index: from } = trail.current;
      const step = steps[index];
      if (!step || index === from || locked.current || base.status !== 'accepted') return;
      commit({ steps, index });
      current.current = step.snapshot;
      ready.current = undefined;
      setSnapshot(step.snapshot);
      setApplyError(undefined);
      setStacked(false);
      settle(step);
    },
    [base, commit, settle],
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
    /** 노드 묶음을 통째로 바꾼다(리믹스 Connection Apply, #151). 바뀐 것이 없으면 그대로다 */
    replace: update,
    reorder,
    reset,
    apply,
    applying,
    applyError,
    stacked,
    preview: scheduler.state,
    /**
     * 편집 기록(Preview 이전/다음, #261). index 0 은 고치기 전 값이다.
     * answer 는 지금 칸에서 전에 만들어 둔 미리보기(다시 만드는 동안에도 보여 줄 수 있다).
     */
    history: {
      index: history.index,
      count: history.steps.length,
      answer: history.steps[history.index]?.answer,
      previous: () => go(trail.current.index - 1),
      next: () => go(trail.current.index + 1),
    },
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

/**
 * 미리보기 요청(revise)·확정(accept). appliedIds 를 주면 revise 에 appliedConnectionIds 로 싣는다(#151).
 * 같은 노드 값이라도 실은 Connection 이 다르면 다른 시도로 본다.
 */
export function createEditorRequests(
  base: Answer,
  client: QueryClient,
  appliedIds: () => readonly string[] = () => [],
) {
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
      const applied = [...new Set(appliedIds())].sort();
      const snapshot = JSON.stringify([nodes, applied]);
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
                applied.length > 0
                  ? { baseAnswerId: base.id, nodes, appliedConnectionIds: applied }
                  : { baseAnswerId: base.id, nodes },
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
