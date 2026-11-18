import {
  AdvanceJobResponseSchema,
  JobStageSchema,
  NodeStageSchema,
  type AdvanceJobResponse,
  type Job,
  type JobStage,
} from '@tome/shared';
import { ApiRequestError } from '../../shared/api';

export interface GenerationRunnerOptions {
  job: Job;
  signal: AbortSignal;
  advance: (jobId: string, stage: JobStage) => Promise<AdvanceJobResponse>;
  onStep: (response: AdvanceJobResponse) => void;
  onError: (stage: JobStage, error: unknown) => void;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}

export async function runGeneration({
  job: initial,
  signal,
  advance,
  onStep,
  onError,
}: GenerationRunnerOptions): Promise<void> {
  let job = initial;
  while (
    !signal.aborted &&
    job.nextStage &&
    !['failed', 'cancelled', 'succeeded'].includes(job.status)
  ) {
    const stage = job.nextStage;
    try {
      const response = await advance(job.id, stage);
      if (signal.aborted) return;
      const parsed = AdvanceJobResponseSchema.safeParse(response);
      if (!parsed.success) {
        throw new ApiRequestError(502, {
          code: 'AI_OUTPUT_INVALID',
          message: 'Unexpected generation response',
          retryable: true,
        });
      }
      const result = parsed.data;
      if (signal.aborted) return;
      const combinedImage =
        stage === 'assemble' &&
        result.step.stage === 'image' &&
        result.job.steps.some(
          (entry) => entry.stage === 'assemble' && entry.status === 'succeeded',
        );
      const nextIndex =
        result.job.nextStage === null
          ? Infinity
          : JobStageSchema.options.indexOf(result.job.nextStage);
      if (
        result.job.id !== job.id ||
        (!combinedImage && result.step.stage !== stage) ||
        nextIndex <= JobStageSchema.options.indexOf(result.step.stage) ||
        !['succeeded', 'skipped'].includes(result.step.status) ||
        result.job.nextStage === stage
      ) {
        throw new ApiRequestError(502, {
          code: 'AI_OUTPUT_INVALID',
          message: 'Unexpected generation response',
          retryable: true,
        });
      }
      if (
        result.step.status !== 'skipped' &&
        ['analyze', 'evidence', 'draft'].includes(stage) &&
        !result.step.nodes?.length
      ) {
        throw new ApiRequestError(502, {
          code: 'AI_OUTPUT_INVALID',
          message: 'Empty stage output',
          retryable: true,
        });
      }
      if (
        (NodeStageSchema.safeParse(result.step.stage).success &&
          result.step.nodes?.some((node) => node.stage !== result.step.stage)) ||
        (result.step.stage === 'image' && !result.step.answer?.imageUrl)
      ) {
        throw new ApiRequestError(502, {
          code: 'AI_OUTPUT_INVALID',
          message: 'Invalid stage output',
          retryable: true,
        });
      }
      onStep(result);
      job = result.job;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ApiRequestError && error.code === 'STEP_IN_PROGRESS') {
        const retryAfter = error.details?.retryAfterMs;
        await delay(
          typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter
            : 1000,
          signal,
        );
        continue;
      }
      onError(stage, error);
      return;
    }
  }
}
