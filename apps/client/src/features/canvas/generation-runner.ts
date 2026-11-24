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

/** AI_TIMEOUT 이면 오류를 보이기 전에 같은 단계를 몇 번 더 부를지(#222). 그림 모델이 가끔 느리다. */
export const TIMEOUT_AUTO_RETRIES = 1;
/** 자동 재시도 전 잠깐 쉬는 시간(ms). */
const TIMEOUT_RETRY_DELAY_MS = 500;

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
  // 단계별 시간 초과 자동 재시도 횟수
  const timeoutRetries = new Map<JobStage, number>();
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
      if (error instanceof ApiRequestError && error.code === 'AI_TIMEOUT') {
        const used = timeoutRetries.get(stage) ?? 0;
        if (used < TIMEOUT_AUTO_RETRIES) {
          timeoutRetries.set(stage, used + 1);
          await delay(TIMEOUT_RETRY_DELAY_MS, signal);
          continue;
        }
      }
      onError(stage, error);
      return;
    }
  }
}
