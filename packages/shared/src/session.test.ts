import { describe, expect, it } from 'vitest';
import { LIMITS } from './common.js';
import {
  AdminAccessCodeRequestSchema,
  AdminAccessCodeResponseSchema,
  ConsentRequestSchema,
  ConsentResponseSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  CreatorKindSchema,
  CreatorSummarySchema,
  MeResponseSchema,
} from './session.js';
import { creator } from './testing/fixtures.js';

describe('session schemas', () => {
  it('parses a creator summary and rejects unknown kinds', () => {
    expect(CreatorSummarySchema.safeParse(creator).success).toBe(true);
    expect(CreatorKindSchema.safeParse('admin').success).toBe(false);
  });

  it('enforces displayName and bio length limits', () => {
    const name = (n: number) => ({ ...creator, displayName: 'a'.repeat(n) });
    expect(CreatorSummarySchema.safeParse(name(LIMITS.DISPLAY_NAME_MAX)).success).toBe(true);
    expect(CreatorSummarySchema.safeParse(name(LIMITS.DISPLAY_NAME_MAX + 1)).success).toBe(false);
    const bio = (n: number) => ({ ...creator, bio: 'a'.repeat(n) });
    expect(CreatorSummarySchema.safeParse(bio(LIMITS.BIO_MAX)).success).toBe(true);
    expect(CreatorSummarySchema.safeParse(bio(LIMITS.BIO_MAX + 1)).success).toBe(false);
  });

  it('requires a non-empty access code', () => {
    expect(CreateSessionRequestSchema.safeParse({ code: 'abc' }).success).toBe(true);
    expect(CreateSessionRequestSchema.safeParse({ code: '' }).success).toBe(false);
  });

  it('parses session, consent and me responses', () => {
    expect(
      CreateSessionResponseSchema.safeParse({
        token: 't',
        creator,
        consentRequired: true,
        noticeVersion: 'v1',
      }).success,
    ).toBe(true);
    expect(ConsentRequestSchema.safeParse({ noticeVersion: '' }).success).toBe(false);
    expect(ConsentResponseSchema.safeParse({ agreedAt: '2026-11-08T09:30:00Z' }).success).toBe(
      true,
    );
    expect(MeResponseSchema.safeParse({ creator, consented: false, limits: {} }).success).toBe(
      true,
    );
  });

  it('requires creatorId exactly when the admin access code target is creator', () => {
    const id = creator.id;
    const ok = (v: object) => AdminAccessCodeRequestSchema.safeParse(v).success;
    expect(ok({ code: 'c', target: 'creator', creatorId: id, active: true })).toBe(true);
    expect(ok({ code: 'c', target: 'visitor_pool', active: true })).toBe(true);
    expect(ok({ code: 'c', target: 'creator', active: true })).toBe(false);
    expect(ok({ code: 'c', target: 'visitor_pool', creatorId: id, active: true })).toBe(false);
    expect(ok({ code: '', target: 'visitor_pool', active: true })).toBe(false);
    expect(ok({ code: 'c', target: 'visitor_pool' })).toBe(false);
  });

  it('parses an admin access code response', () => {
    expect(
      AdminAccessCodeResponseSchema.safeParse({
        accessCode: {
          id: creator.id,
          label: 'l',
          target: 'visitor_pool',
          creatorId: null,
          active: true,
          createdAt: '2026-11-08T09:30:00Z',
        },
      }).success,
    ).toBe(true);
  });
});
