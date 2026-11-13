import { describe, expect, it } from 'vitest';
import { hashCode, verifyCode } from './code-hash';

describe('code hash', () => {
  it('verifies the right code and rejects a wrong one', async () => {
    const stored = await hashCode('open-sesame');
    expect(await verifyCode('open-sesame', stored)).toBe(true);
    expect(await verifyCode('open-sesame ', stored)).toBe(false);
    expect(await verifyCode('nope', stored)).toBe(false);
  });

  it('uses a random salt and never stores the plain code', async () => {
    const a = await hashCode('same');
    const b = await hashCode('same');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$[\w-]+\$[\w-]+$/);
    expect(a).not.toContain('same');
    expect(await verifyCode('same', a)).toBe(true);
    expect(await verifyCode('same', b)).toBe(true);
  });

  it('rejects malformed stored values', async () => {
    expect(await verifyCode('x', 'plain')).toBe(false);
    expect(await verifyCode('x', 'scrypt$$')).toBe(false);
    expect(await verifyCode('x', 'md5$a$b')).toBe(false);
  });
});
