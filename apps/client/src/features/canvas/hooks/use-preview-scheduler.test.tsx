import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Answer, NodeSnapshot } from '@tome/shared';
import { ApiRequestError } from '../../../shared/api';
import { usePreviewScheduler } from './use-preview-scheduler';

const snapshot: NodeSnapshot = { schemaVersion: 1, subjectTemplate: 'Lamp', nodes: [] };
const answer = { id: 'preview' } as Answer;
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

it('waits three seconds after the last input and captures an immutable snapshot', async () => {
  const request = vi.fn().mockResolvedValue(answer);
  const { result, unmount } = renderHook(() => usePreviewScheduler(request));
  act(() => result.current.schedule(snapshot));
  await tick(2000);
  const latest = { ...snapshot, subjectTemplate: 'Desk' };
  act(() => result.current.schedule(latest));
  latest.subjectTemplate = 'Changed outside';
  await tick(2999);
  expect(request).not.toHaveBeenCalled();
  expect(result.current.canApply).toBe(false);
  await tick(1);
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls[0]![0].subjectTemplate).toBe('Desk');
  expect(result.current.state).toEqual({ status: 'ready', answer });
  expect(result.current.canApply).toBe(true);
  unmount();
});

it('aborts in-flight work and ignores old responses even when cancellation is ignored', async () => {
  let resolveOld!: (answer: Answer) => void;
  const request = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Answer>((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce(answer);
  const { result, unmount } = renderHook(() => usePreviewScheduler(request));
  act(() => result.current.schedule(snapshot));
  await tick(3000);
  const oldSignal = request.mock.calls[0]![1] as AbortSignal;
  expect(result.current.state.status).toBe('generating');
  act(() => result.current.schedule({ ...snapshot, subjectTemplate: 'New' }));
  expect(oldSignal.aborted).toBe(true);
  await act(async () => resolveOld({ ...answer, id: 'old' }));
  expect(result.current.state.status).toBe('waiting');
  await tick(3000);
  expect(result.current.state).toEqual({ status: 'ready', answer });
  unmount();
});

it('invalidates a ready preview immediately on another edit and handles request failures', async () => {
  const error = new Error('offline');
  const request = vi.fn().mockResolvedValueOnce(answer).mockRejectedValueOnce(error);
  const { result, unmount } = renderHook(() => usePreviewScheduler(request));
  act(() => result.current.schedule(snapshot));
  await tick(3000);
  act(() => result.current.schedule(snapshot));
  expect(result.current.canApply).toBe(false);
  await tick(3000);
  expect(result.current.state).toEqual({ status: 'error', error });
  unmount();
});

it('cancels timers explicitly and on unmount', async () => {
  const request = vi.fn();
  const { result, unmount } = renderHook(() => usePreviewScheduler(request));
  act(() => result.current.schedule(snapshot));
  act(() => result.current.cancel());
  await tick(3000);
  expect(request).not.toHaveBeenCalled();
  expect(result.current.state.status).toBe('idle');
  act(() => result.current.schedule(snapshot));
  unmount();
  await tick(3000);
  expect(request).not.toHaveBeenCalled();
});

it('aborts an active request when unmounted', async () => {
  const request = vi.fn().mockImplementation(() => new Promise<Answer>(() => {}));
  const { result, unmount } = renderHook(() => usePreviewScheduler(request));
  act(() => result.current.schedule(snapshot));
  await tick(3000);
  const signal = request.mock.calls[0]![1] as AbortSignal;
  unmount();
  expect(signal.aborted).toBe(true);
});

it('retries immediately and locks a double Retry without another debounce', async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(answer);
  const { result } = renderHook(() => usePreviewScheduler(request));
  act(() => result.current.schedule(snapshot));
  await tick(3000);
  expect(result.current.state.status).toBe('error');
  await act(async () => {
    result.current.retry();
    result.current.retry();
  });
  expect(request).toHaveBeenCalledTimes(2);
  expect(result.current.state.status).toBe('ready');
});

it('clears NO_CHANGES without showing a generation failure', async () => {
  const request = vi
    .fn()
    .mockRejectedValue(
      new ApiRequestError(422, { code: 'NO_CHANGES', message: 'No changes', retryable: false }),
    );
  const { result } = renderHook(() => usePreviewScheduler(request));
  act(() => result.current.schedule(snapshot));
  await tick(3000);
  expect(result.current.state.status).toBe('idle');
  expect(result.current.canApply).toBe(false);
});
