export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 10 * 60 * 1000;

/**
 * IP별 전시 코드 연속 실패 카운터(메모리). 인스턴스 1개 전제이며 IP 는 메모리에만 둔다.
 * 창(10분) 안에 5회 실패하면 그 뒤 요청은 창이 풀릴 때까지 막는다.
 */
export class LoginRateLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  /** 막혀 있으면 기다려야 할 초(1 이상)를, 아니면 null 을 돌려준다. */
  blockedFor(ip: string): number | null {
    const recent = this.recent(ip);
    if (recent.length < LOGIN_MAX_FAILURES) return null;
    const releaseAt = recent[0]! + LOGIN_WINDOW_MS;
    return Math.max(1, Math.ceil((releaseAt - this.now()) / 1000));
  }

  recordFailure(ip: string): void {
    const recent = this.recent(ip);
    recent.push(this.now());
    this.failures.set(ip, recent);
  }

  reset(ip: string): void {
    this.failures.delete(ip);
  }

  /** 모든 IP 의 상태를 지운다(테스트용). */
  clear(): void {
    this.failures.clear();
  }

  private recent(ip: string): number[] {
    const since = this.now() - LOGIN_WINDOW_MS;
    const recent = (this.failures.get(ip) ?? []).filter((at) => at > since);
    if (recent.length === 0) this.failures.delete(ip);
    return recent;
  }
}
