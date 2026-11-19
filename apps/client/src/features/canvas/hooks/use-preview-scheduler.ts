import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '../../../shared/api';
import { LIMITS, type Answer, type NodeSnapshot } from '@tome/shared';

type PreviewState =
  | { status: 'idle' | 'waiting' | 'generating' }
  | { status: 'ready'; answer: Answer }
  | { status: 'error'; error: unknown };

export function usePreviewScheduler(
  requestPreview: (snapshot: NodeSnapshot, signal: AbortSignal) => Promise<Answer>,
) {
  const [state, setState] = useState<PreviewState>({ status: 'idle' });
  const latest = useRef<NodeSnapshot | undefined>(undefined);
  const revision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);

  const invalidate = useCallback(() => {
    revision.current += 1;
    clearTimeout(timer.current);
    timer.current = undefined;
    controller.current?.abort();
    controller.current = undefined;
  }, []);

  useEffect(() => invalidate, [invalidate]);

  const cancel = useCallback(() => {
    invalidate();
    latest.current = undefined;
    setState({ status: 'idle' });
  }, [invalidate]);

  const start = useCallback(
    async (input: NodeSnapshot, version: number) => {
      const run = new AbortController();
      controller.current = run;
      setState({ status: 'generating' });
      try {
        const answer = await requestPreview(input, run.signal);
        if (version === revision.current && !run.signal.aborted)
          setState({ status: 'ready', answer });
      } catch (error) {
        if (version === revision.current && !run.signal.aborted) {
          setState(
            error instanceof ApiRequestError && error.code === 'NO_CHANGES'
              ? { status: 'idle' }
              : { status: 'error', error },
          );
        }
      } finally {
        if (controller.current === run) controller.current = undefined;
      }
    },
    [requestPreview],
  );
  const schedule = useCallback(
    (snapshot: NodeSnapshot) => {
      invalidate();
      const version = revision.current;
      const input = structuredClone(snapshot);
      latest.current = input;
      setState({ status: 'waiting' });
      timer.current = setTimeout(() => {
        timer.current = undefined;
        void start(input, version);
      }, LIMITS.PREVIEW_IDLE_MS);
    },
    [invalidate, start],
  );
  const retry = useCallback(() => {
    if (!latest.current || controller.current || state.status !== 'error') return;
    const input = structuredClone(latest.current);
    invalidate();
    void start(input, revision.current);
  }, [invalidate, start, state.status]);

  return { state, schedule, cancel, retry, canApply: state.status === 'ready' };
}
