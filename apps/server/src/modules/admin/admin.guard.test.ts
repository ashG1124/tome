import { describe, expect, it } from 'vitest';
import { isAdminTokenValid } from './admin.guard';

describe('isAdminTokenValid', () => {
  it('accepts only the exact token', () => {
    expect(isAdminTokenValid('secret-1', 'secret-1')).toBe(true);
    expect(isAdminTokenValid('secret-1', 'secret-2')).toBe(false);
    expect(isAdminTokenValid('secret-1', 'secret')).toBe(false);
  });

  it('rejects when the server token is unset or the header is missing', () => {
    expect(isAdminTokenValid(undefined, 'x')).toBe(false);
    expect(isAdminTokenValid('', '')).toBe(false);
    expect(isAdminTokenValid('secret', undefined)).toBe(false);
    expect(isAdminTokenValid('secret', ['secret'])).toBe(false);
  });
});
