import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdvanceJobResponse, Job, JobStage, NodeStage } from '@tome/shared';
import { ApiRequestError } from '../../shared/api';
import { runGeneration } from './generation-runner';

const job: Job = {
  id: '00000000-0000-4000-8000-000000000001',
  setId: '00000000-0000-4000-8000-000000000003',
  pageId: '00000000-0000-4000-8000-000000000004',
  status: 'running',
  startStage: 'analyze',
  nextStage: 'research',
  steps: [],
};
function result(stage: JobStage, nextStage: JobStage | null): AdvanceJobResponse {
  return {
    job: { ...job, nextStage, status: nextStage ? 'running' : 'succeeded' },
    step: {
      stage,
      status: 'succeeded',
      provider: null,
      fallbackUsed: false,
      nodes: ['analyze', 'research', 'evidence', 'draft', 'verify'].includes(stage)
        ? [
            {
              id: 'e1',
              kind: 'evidence',
              stage: stage as NodeStage,
              text: 'Material',
              enabled: true,
              parentIds: [],
            },
          ]
        : undefined,
      answer:
        stage === 'image'
          ? {
              id: '00000000-0000-4000-8000-000000000002',
              setId: '00000000-0000-4000-8000-000000000003',
              number: 1,
              pinned: false,
              isSample: false,
              status: 'accepted',
              origin: 'generated',
              imageMode: 'generate',
              baseAnswerId: null,
              thumbUrl: '/test-image',
              imageUrl: '/test-image',
              createdAt: '2026-11-01T00:00:00Z',
              nodes: { schemaVersion: 1, subjectTemplate: 'Lamp', nodes: [] },
              verification: null,
            }
          : undefined,
    },
  };
}
afterEach(() => vi.useRealTimers());
describe('generation runner', () => {
  it.each(['analyze', 'evidence', 'draft'] as const)(
    'accepts skipped %s without nodes and continues at nextStage',
    async (stage) => {
      const skipped = result(stage, 'verify');
      skipped.step.status = 'skipped';
      delete skipped.step.nodes;
      const advance = vi
        .fn()
        .mockResolvedValueOnce(skipped)
        .mockResolvedValueOnce(result('verify', null));
      const onError = vi.fn();
      const onStep = vi.fn();
      await runGeneration({
        job: { ...job, nextStage: stage },
        signal: new AbortController().signal,
        advance,
        onStep,
        onError,
      });
      expect(onError).not.toHaveBeenCalled();
      expect(advance.mock.calls.map((call) => call[1])).toEqual([stage, 'verify']);
      expect(onStep).toHaveBeenCalledTimes(2);
    },
  );
  it('uses the returned next stage, including nonvisual stages', async () => {
    const advance = vi
      .fn()
      .mockResolvedValueOnce(result('research', 'assemble'))
      .mockResolvedValueOnce(result('assemble', 'image'))
      .mockResolvedValueOnce(result('image', 'verify'))
      .mockResolvedValueOnce(result('verify', null));
    const onStep = vi.fn();
    const onError = vi.fn();
    await runGeneration({ job, signal: new AbortController().signal, advance, onStep, onError });
    expect(advance.mock.calls.map((call) => call[1])).toEqual([
      'research',
      'assemble',
      'image',
      'verify',
    ]);
    expect(onStep).toHaveBeenCalledTimes(4);
    expect(onError).not.toHaveBeenCalled();
  });
  it('waits for STEP_IN_PROGRESS and repeats only that stage', async () => {
    vi.useFakeTimers();
    const advance = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiRequestError(409, {
          code: 'STEP_IN_PROGRESS',
          message: 'Busy',
          retryable: true,
          details: { retryAfterMs: 250 },
        }),
      )
      .mockResolvedValueOnce(result('research', null));
    const onError = vi.fn();
    const pending = runGeneration({
      job,
      signal: new AbortController().signal,
      advance,
      onStep: vi.fn(),
      onError,
    });
    await vi.advanceTimersByTimeAsync(249);
    expect(advance).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(advance).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });
  it('(#222) retries a stage once on AI_TIMEOUT before showing the error', async () => {
    vi.useFakeTimers();
    const timeout = () =>
      new ApiRequestError(504, { code: 'AI_TIMEOUT', message: 'Slow', retryable: true });
    const advance = vi
      .fn()
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce(result('research', null));
    const onError = vi.fn();
    const pending = runGeneration({
      job,
      signal: new AbortController().signal,
      advance,
      onStep: vi.fn(),
      onError,
    });
    await vi.advanceTimersByTimeAsync(500);
    await pending;
    expect(advance).toHaveBeenCalledTimes(2);
    expect(advance.mock.calls.map((call) => call[1])).toEqual(['research', 'research']);
    expect(onError).not.toHaveBeenCalled();
  });
  it('(#222) shows the error when the automatic retry times out again', async () => {
    vi.useFakeTimers();
    const error = new ApiRequestError(504, {
      code: 'AI_TIMEOUT',
      message: 'Slow',
      retryable: true,
    });
    const advance = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    const pending = runGeneration({
      job,
      signal: new AbortController().signal,
      advance,
      onStep: vi.fn(),
      onError,
    });
    await vi.advanceTimersByTimeAsync(500);
    await pending;
    expect(advance).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith('research', error);
  });
  it('stops at the failed stage without consuming later stages', async () => {
    const error = new Error('network');
    const advance = vi
      .fn()
      .mockResolvedValueOnce(result('research', 'evidence'))
      .mockRejectedValueOnce(error);
    const onStep = vi.fn();
    const onError = vi.fn();
    await runGeneration({ job, signal: new AbortController().signal, advance, onStep, onError });
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('evidence', error);
    expect(advance).toHaveBeenCalledTimes(2);
  });
  it('ignores a response received after leaving the page', async () => {
    const controller = new AbortController();
    const onStep = vi.fn();
    const advance = vi.fn(async () => {
      controller.abort();
      return result('research', 'evidence');
    });
    await runGeneration({ job, signal: controller.signal, advance, onStep, onError: vi.fn() });
    expect(onStep).not.toHaveBeenCalled();
    expect(advance).toHaveBeenCalledTimes(1);
  });
  it('rejects empty required output without erasing earlier steps', async () => {
    const empty = result('evidence', 'draft');
    empty.step.nodes = [];
    const onError = vi.fn();
    const onStep = vi.fn();
    await runGeneration({
      job: { ...job, nextStage: 'evidence' },
      signal: new AbortController().signal,
      advance: vi.fn().mockResolvedValue(empty),
      onStep,
      onError,
    });
    expect(onStep).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      'evidence',
      expect.objectContaining({ code: 'AI_OUTPUT_INVALID' }),
    );
  });
});

describe('generation cancellation and invalid responses', () => {
  it('cancels a 409 wait without another request', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const advance = vi.fn().mockRejectedValue(
      new ApiRequestError(409, {
        code: 'STEP_IN_PROGRESS',
        message: 'Busy',
        retryable: true,
        details: { retryAfterMs: 1000 },
      }),
    );
    const onError = vi.fn();
    const pending = runGeneration({
      job,
      signal: controller.signal,
      advance,
      onStep: vi.fn(),
      onError,
    });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await pending;
    expect(advance).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('rejects responses that violate the shared schema', async () => {
    const invalid = result('research', null);
    invalid.step.nodes![0]!.id = 'invalid-node';
    const onStep = vi.fn();
    const onError = vi.fn();
    await runGeneration({
      job,
      signal: new AbortController().signal,
      advance: vi.fn().mockResolvedValue(invalid),
      onStep,
      onError,
    });
    expect(onStep).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      'research',
      expect.objectContaining({ code: 'AI_OUTPUT_INVALID' }),
    );
  });
});

it('accepts a combined assemble and image response when assembly is recorded', async () => {
  const response = result('image', 'verify');
  response.job.steps = [
    { stage: 'assemble', status: 'succeeded' },
    { stage: 'image', status: 'succeeded' },
  ];
  const onError = vi.fn();
  const onStep = vi.fn();
  const advance = vi
    .fn()
    .mockResolvedValueOnce(response)
    .mockResolvedValueOnce(result('verify', null));
  await runGeneration({
    job: { ...job, nextStage: 'assemble' },
    signal: new AbortController().signal,
    advance,
    onStep,
    onError,
  });
  expect(onError).not.toHaveBeenCalled();
  expect(onStep).toHaveBeenCalledTimes(2);
});
it('rejects a stage response containing nodes from another stage', async () => {
  const response = result('research', 'evidence');
  response.step.nodes![0]!.stage = 'draft';
  const onError = vi.fn();
  await runGeneration({
    job,
    signal: new AbortController().signal,
    advance: vi.fn().mockResolvedValue(response),
    onStep: vi.fn(),
    onError,
  });
  expect(onError).toHaveBeenCalledWith(
    'research',
    expect.objectContaining({ code: 'AI_OUTPUT_INVALID' }),
  );
});

it.each(['DAILY_LIMIT_REACHED', 'BUDGET_REACHED'] as const)(
  'stops on %s without retrying automatically',
  async (code) => {
    const error = new ApiRequestError(429, { code, message: 'Limit reached', retryable: false });
    const advance = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    await runGeneration({
      job,
      signal: new AbortController().signal,
      advance,
      onStep: vi.fn(),
      onError,
    });
    expect(advance).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(job.nextStage, error);
  },
);

it('accepts a sample image with a null version number and continues verification', async () => {
  const sample = result('image', 'verify');
  sample.step.answer = { ...sample.step.answer!, number: null, origin: 'sample', isSample: true };
  const advance = vi
    .fn()
    .mockResolvedValueOnce(sample)
    .mockResolvedValueOnce(result('verify', null));
  const onStep = vi.fn();
  const onError = vi.fn();
  await runGeneration({
    job: { ...job, nextStage: 'image' },
    signal: new AbortController().signal,
    advance,
    onStep,
    onError,
  });
  expect(onError).not.toHaveBeenCalled();
  expect(onStep.mock.calls[0]![0].step.answer).toMatchObject({ isSample: true, number: null });
  expect(advance.mock.calls.map((call) => call[1])).toEqual(['image', 'verify']);
});
