import { describe, expect, it, vi } from 'vitest';
import { verifyCode } from '../modules/session/code-hash';
import { registerShowcaseAccessCode, SHOWCASE_CODE_LABEL } from './access-code';
import { SHOWCASE_CREATOR_ID } from './creators';

/** 트랜잭션 안의 Prisma 호출만 흉내 낸다(같은 label 행이 있으면 update, 없으면 create). */
function fakePrisma(existingId: string | null) {
  const calls = {
    lock: vi.fn().mockResolvedValue(1),
    findFirst: vi.fn().mockResolvedValue(existingId ? { id: existingId } : null),
    update: vi.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: existingId,
        label: SHOWCASE_CODE_LABEL,
        createdAt: new Date(),
        ...args.data,
      }),
    ),
    create: vi.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'new', createdAt: new Date(), ...args.data }),
    ),
  };
  const tx = {
    $executeRaw: calls.lock,
    accessCode: { findFirst: calls.findFirst, update: calls.update, create: calls.create },
  };
  const prisma = {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as Parameters<typeof registerShowcaseAccessCode>[0];
  return { prisma, calls };
}

describe('registerShowcaseAccessCode', () => {
  it('creates the showcase code for the showcase creator with the admin hash format', async () => {
    const { prisma, calls } = fakePrisma(null);
    await registerShowcaseAccessCode(prisma, 'museum-2026');
    expect(calls.lock).toHaveBeenCalledTimes(1);
    expect(calls.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { label: 'showcase' } }),
    );
    const data = calls.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data).toMatchObject({
      label: 'showcase',
      target: 'creator',
      creatorId: SHOWCASE_CREATOR_ID,
      active: true,
    });
    const hash = data.codeHash as string;
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain('museum-2026');
    expect(await verifyCode('museum-2026', hash)).toBe(true);
    expect(await verifyCode('museum-2027', hash)).toBe(false);
    expect(calls.update).not.toHaveBeenCalled();
  });

  it('re-running replaces the code on the same row (idempotent by label)', async () => {
    const { prisma, calls } = fakePrisma('row-1');
    await registerShowcaseAccessCode(prisma, 'second-code');
    expect(calls.create).not.toHaveBeenCalled();
    const args = calls.update.mock.calls[0]![0] as unknown as {
      where: { id: string };
      data: { codeHash: string; active: boolean };
    };
    expect(args.where).toEqual({ id: 'row-1' });
    expect(args.data.active).toBe(true);
    expect(await verifyCode('second-code', args.data.codeHash)).toBe(true);
  });

  it('rejects an empty code like the admin API, without touching the database', async () => {
    const { prisma, calls } = fakePrisma(null);
    await expect(registerShowcaseAccessCode(prisma, '')).rejects.toThrow();
    expect(calls.lock).not.toHaveBeenCalled();
  });
});
