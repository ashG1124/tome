import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { GetJobResponse, JobStage, WorkspaceResponse } from '@tome/shared';
import { api, ApiRequestError, errorCopyKey, NetworkError } from '../../../shared/api';
import { CANVAS_COPY, COPY } from '../../../shared/copy';
import { runGeneration } from '../generation-runner';
import { visibleStage, VISIBLE_STAGES, type GenerationView } from '../model';

export function useGeneration(projectId: string, pageId: string, workspace: WorkspaceResponse) {
  const client = useQueryClient();
  const workspaceKey = useMemo(() => ['workspace', projectId], [projectId]);
  const [lastJobId, setLastJobId] = useState(workspace.activeJob?.id);
  const jobId = workspace.activeJob?.id ?? lastJobId;
  const jobKey = useMemo(
    () => ['generation', projectId, pageId, jobId],
    [projectId, pageId, jobId],
  );
  const snapshot = useQuery<GetJobResponse>({
    queryKey: jobKey,
    queryFn: () => api.getJob(jobId!),
    enabled: Boolean(jobId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const targetJob = snapshot.data?.job;
  const targetSetId =
    targetJob &&
    targetJob.pageId === pageId &&
    workspace.currentPageId === pageId &&
    workspace.sets.some((set) => set.id === targetJob.setId)
      ? targetJob.setId
      : undefined;
  const [failure, setFailure] = useState<{
    jobId: string;
    stage: JobStage;
    error: unknown;
    attempts: number;
  } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const attempts = useRef(new Map<string, number>());
  const controller = useRef<AbortController | null>(null);

  const start = useCallback(
    async (retry = false) => {
      if (!jobId || !targetSetId) return;
      const current = client.getQueryData<GetJobResponse>(jobKey);
      if (
        !current ||
        !current.job.nextStage ||
        ['succeeded', 'failed', 'cancelled'].includes(current.job.status)
      )
        return;
      if (!retry && current.steps.some((step) => step.status === 'failed')) return;
      const attemptKey = `${jobId}:${current.job.nextStage}`;
      if (retry) {
        const count = attempts.current.get(attemptKey) ?? 0;
        if (count >= 3) return;
        attempts.current.set(attemptKey, count + 1);
      }
      controller.current?.abort();
      const run = new AbortController();
      controller.current = run;
      setFailure(null);
      if (retry)
        client.setQueryData<GetJobResponse>(jobKey, {
          ...current,
          steps: current.steps.filter((step) => step.status !== 'failed'),
        });
      setAnnouncement(CANVAS_COPY.started);
      let failed = false;
      await runGeneration({
        job: current.job,
        signal: run.signal,
        advance: api.advanceJob,
        onStep: ({ job, step }) => {
          setLastJobId(job.id);
          client.setQueryData<GetJobResponse>(jobKey, (previous) => ({
            job,
            steps: [...(previous?.steps ?? []).filter((entry) => entry.stage !== step.stage), step],
          }));
          client.setQueriesData<WorkspaceResponse>({ queryKey: workspaceKey }, (previous) => {
            if (!previous || previous.currentPageId !== pageId) return previous;
            return {
              ...previous,
              activeJob: job.status === 'succeeded' ? undefined : job,
              sets: previous.sets.map((set) => {
                if (set.id !== targetSetId) return set;
                const answer = step.answer ?? set.latestAnswer;
                if (!answer) return set;
                const updated = step.verification
                  ? { ...answer, verification: step.verification }
                  : answer;
                return {
                  ...set,
                  latestAnswer: updated,
                  answers: step.answer
                    ? [...set.answers.filter((entry) => entry.id !== updated.id), updated]
                    : set.answers,
                };
              }),
            };
          });
          const visible = visibleStage(step.stage);
          if (visible) setAnnouncement(CANVAS_COPY.stepDone(VISIBLE_STAGES.indexOf(visible) + 1));
          if (job.status === 'succeeded') void client.invalidateQueries({ queryKey: workspaceKey });
        },
        onError: (stage, error) => {
          setLastJobId(jobId);
          failed = true;
          setFailure({
            jobId,
            stage,
            error,
            attempts: attempts.current.get(`${jobId}:${stage}`) ?? 0,
          });
        },
      });
      if (failed && !run.signal.aborted) {
        try {
          const saved = await api.getJob(jobId);
          if (!run.signal.aborted) {
            client.setQueryData(jobKey, saved);
            if (saved.job.status === 'failed')
              void client.invalidateQueries({ queryKey: workspaceKey });
          }
        } catch {
          /* Keep the last rendered output when the connection is unavailable. */
        }
      }
      if (controller.current === run) controller.current = null;
    },
    [client, jobId, targetSetId, jobKey, workspaceKey, pageId],
  );

  const loaded = Boolean(snapshot.data);
  useEffect(() => {
    if (loaded) void start();
    return () => {
      controller.current?.abort();
      controller.current = null;
    };
  }, [loaded, start]);

  const failedStage = snapshot.data?.steps.find((step) => step.status === 'failed')?.stage;
  const localFailure = failure?.jobId === jobId ? failure : null;
  const errorStage = localFailure?.stage ?? failedStage;
  const error = localFailure?.error;
  const canRetry =
    (!error ||
      error instanceof NetworkError ||
      (error instanceof ApiRequestError && error.retryable)) &&
    (localFailure?.attempts ?? 0) < 3 &&
    snapshot.data?.job.status !== 'failed';
  const retry = useCallback(() => start(true), [start]);
  const generation: GenerationView | undefined =
    snapshot.data && targetSetId
      ? {
          setId: targetSetId,
          job: snapshot.data.job,
          steps: snapshot.data.steps,
          error: errorStage
            ? { stage: errorStage, message: COPY[errorCopyKey(error)], retryable: canRetry }
            : undefined,
          onRetry: retry,
        }
      : undefined;
  return {
    generation,
    announcement,
    busy: workspace.activeJob !== undefined,
    loadError: snapshot.error,
    reload: () => void snapshot.refetch(),
    error,
  };
}
