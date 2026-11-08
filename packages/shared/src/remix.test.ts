import { describe, expect, it } from 'vitest';
import {
  ConnectionListResponseSchema,
  ConnectionSchema,
  RemixCandidatesResponseSchema,
  RemixStateSchema,
  SetRemixPartnerRequestSchema,
} from './remix.js';
import { ID_A, ID_B, creator } from './testing/fixtures.js';

describe('remix schemas', () => {
  it('parses remix candidates', () => {
    const candidate = {
      id: ID_A,
      displayName: 'Mara Quill',
      bio: null,
      avatarUrl: null,
      favorite: true,
      provisional: false,
    };
    const parse = (id: string) =>
      RemixCandidatesResponseSchema.safeParse({ creators: [{ ...candidate, id }] }).success;
    expect(parse(ID_A)).toBe(true);
    expect(parse('x')).toBe(false);
  });

  it('accepts a uuid or null partner and rejects other values', () => {
    expect(SetRemixPartnerRequestSchema.safeParse({ partnerId: ID_A }).success).toBe(true);
    expect(SetRemixPartnerRequestSchema.safeParse({ partnerId: null }).success).toBe(true);
    expect(SetRemixPartnerRequestSchema.safeParse({ partnerId: 'x' }).success).toBe(false);
    expect(SetRemixPartnerRequestSchema.safeParse({}).success).toBe(false);
  });

  it('parses remix state', () => {
    expect(RemixStateSchema.safeParse({ partner: creator, snapshotId: ID_B }).success).toBe(true);
  });

  it('parses connections and rejects unknown status', () => {
    const connection = {
      id: ID_A,
      nodeId: 'a1',
      predictedAction: 'raise',
      sentence: 'Ranked effect over form 7 of 10 times',
      status: 'shown',
    };
    expect(ConnectionSchema.safeParse(connection).success).toBe(true);
    expect(ConnectionListResponseSchema.safeParse({ connections: [connection] }).success).toBe(
      true,
    );
    expect(ConnectionSchema.safeParse({ ...connection, status: 'hidden' }).success).toBe(false);
  });
});
