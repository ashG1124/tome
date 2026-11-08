import { describe, expect, it } from 'vitest';
import {
  CompareResponseSchema,
  CreatorProfileResponseSchema,
  IdentityAxesSchema,
  IdentityResponseSchema,
  IdentitySnapshotSchema,
} from './identity.js';
import { NOW, creator, project } from './testing/fixtures.js';

const axes = { scaleIntensity: 70, aiRelation: -20.5, decisionBasis: null, direction: 100 };
const metrics = {
  sessions: 3,
  nodeEdits: 12,
  reasonedRatio: 0.6,
  firstRecordedAt: NOW,
  lastActiveAt: null,
  originBreakdown: { own: 10, remix: 1, derived: 1 },
};
const snapshot = {
  algoVersion: 'identity-v1',
  axes,
  metrics,
  eventCount: 30,
  projectCount: 2,
  provisional: true,
  computedAt: NOW,
};

describe('identity schemas', () => {
  it('accepts axis scores at -100 and 100 and null', () => {
    expect(IdentityAxesSchema.safeParse(axes).success).toBe(true);
    expect(IdentityAxesSchema.safeParse({ ...axes, direction: -100 }).success).toBe(true);
  });

  it('rejects axis scores beyond +-100', () => {
    expect(IdentityAxesSchema.safeParse({ ...axes, direction: 100.1 }).success).toBe(false);
    expect(IdentityAxesSchema.safeParse({ ...axes, aiRelation: -101 }).success).toBe(false);
  });

  it('parses a snapshot and bounds reasonedRatio to 0..1', () => {
    const ratio = (reasonedRatio: number) =>
      IdentitySnapshotSchema.safeParse({ ...snapshot, metrics: { ...metrics, reasonedRatio } })
        .success;
    expect(IdentitySnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(ratio(1)).toBe(true);
    expect(ratio(1.01)).toBe(false);
  });

  it('rejects negative counts', () => {
    expect(IdentitySnapshotSchema.safeParse({ ...snapshot, eventCount: -1 }).success).toBe(false);
  });

  it('parses identity, compare and profile responses', () => {
    const row = (axis: string) => ({ snapshot, table: [{ axis, score: 1 }] });
    expect(IdentityResponseSchema.safeParse(row('direction')).success).toBe(true);
    expect(IdentityResponseSchema.safeParse(row('x')).success).toBe(false);
    const entry = { creator, axes, provisional: false };
    expect(CompareResponseSchema.safeParse({ me: entry, others: [entry] }).success).toBe(true);
    expect(
      CreatorProfileResponseSchema.safeParse({ creator, works: [project], identity: null }).success,
    ).toBe(true);
  });
});
