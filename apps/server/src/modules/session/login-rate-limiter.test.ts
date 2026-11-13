import { describe, expect, it } from 'vitest';
import { LOGIN_WINDOW_MS, LoginRateLimiter } from './login-rate-limiter';

function setup() {
  let t = 1_000_000;
  const limiter = new LoginRateLimiter(() => t);
  return { limiter, advance: (ms: number) => (t += ms) };
}

describe('LoginRateLimiter', () => {
  it('allows 5 failures and blocks from the 6th request', () => {
    const { limiter } = setup();
    for (let i = 0; i < 5; i++) {
      expect(limiter.blockedFor('ip')).toBeNull();
      limiter.recordFailure('ip');
    }
    expect(limiter.blockedFor('ip')).toBe(LOGIN_WINDOW_MS / 1000);
  });

  it('counts each IP separately', () => {
    const { limiter } = setup();
    for (let i = 0; i < 5; i++) limiter.recordFailure('a');
    expect(limiter.blockedFor('a')).not.toBeNull();
    expect(limiter.blockedFor('b')).toBeNull();
  });

  it('reports the remaining seconds and releases after 10 minutes', () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 5; i++) limiter.recordFailure('ip');
    advance(LOGIN_WINDOW_MS - 30_000);
    expect(limiter.blockedFor('ip')).toBe(30);
    advance(30_000);
    expect(limiter.blockedFor('ip')).toBeNull();
  });

  it('forgets an IP after a success', () => {
    const { limiter } = setup();
    for (let i = 0; i < 4; i++) limiter.recordFailure('ip');
    limiter.reset('ip');
    limiter.recordFailure('ip');
    expect(limiter.blockedFor('ip')).toBeNull();
  });

  it('clear() drops every IP', () => {
    const { limiter } = setup();
    for (let i = 0; i < 5; i++) limiter.recordFailure('ip');
    limiter.clear();
    expect(limiter.blockedFor('ip')).toBeNull();
  });
});
