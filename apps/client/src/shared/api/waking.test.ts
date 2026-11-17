import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetFirstRequestWatch,
  SLOW_FIRST_REQUEST_MS,
  useWakingStore,
  watchFirstRequest,
} from './waking';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const waking = () => useWakingStore.getState().waking;

beforeEach(() => {
  vi.useFakeTimers();
  resetFirstRequestWatch();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('watchFirstRequest', () => {
  it('첫 요청이 1초를 넘기면 켜지고, 끝나면 꺼진다', async () => {
    const first = deferred();
    void watchFirstRequest(first.promise);

    vi.advanceTimersByTime(SLOW_FIRST_REQUEST_MS - 1);
    expect(waking()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(waking()).toBe(true);

    first.resolve();
    await vi.runAllTimersAsync();
    expect(waking()).toBe(false);
  });

  it('1초 안에 끝나면 켜지지 않는다', async () => {
    const first = deferred();
    void watchFirstRequest(first.promise);

    first.resolve();
    await vi.advanceTimersByTimeAsync(SLOW_FIRST_REQUEST_MS * 2);
    expect(waking()).toBe(false);
  });

  it('첫 요청이 실패해도 꺼진다', async () => {
    const first = deferred();
    const watched = watchFirstRequest(first.promise);

    vi.advanceTimersByTime(SLOW_FIRST_REQUEST_MS);
    expect(waking()).toBe(true);
    first.reject(new Error('down'));
    await expect(watched).rejects.toThrow('down');
    expect(waking()).toBe(false);
  });

  it('두 번째 요청부터는 느려도 켜지지 않는다', async () => {
    const first = deferred();
    void watchFirstRequest(first.promise);
    first.resolve();
    await vi.runAllTimersAsync();

    const second = deferred();
    void watchFirstRequest(second.promise);
    vi.advanceTimersByTime(SLOW_FIRST_REQUEST_MS * 3);
    expect(waking()).toBe(false);
  });
});
