import { describe, expect, it } from 'vitest';
import { LIMITS } from './common.js';
import {
  ClientEventTypeSchema,
  EventBatchRequestSchema,
  EventBatchResponseSchema,
  EventEnvelopeSchema,
  EventPayloadSchemas,
  EventTypeSchema,
  ServerEventTypeSchema,
} from './event.js';
import { ID_A, NOW } from './testing/fixtures.js';

const event = {
  id: ID_A,
  schemaVersion: 1,
  type: 'node_open',
  clientTs: NOW,
  payload: { nodeId: 'k1' },
};

describe('event types', () => {
  it('includes every client and server type', () => {
    expect(ClientEventTypeSchema.options).toHaveLength(18);
    expect(ServerEventTypeSchema.options).toHaveLength(10);
    expect(EventTypeSchema.options).toHaveLength(28);
  });

  it('has a payload schema for every type', () => {
    expect(Object.keys(EventPayloadSchemas).sort()).toEqual([...EventTypeSchema.options].sort());
  });

  it('excludes the dropped types', () => {
    expect(EventTypeSchema.safeParse('trace_view').success).toBe(false);
    expect(EventTypeSchema.safeParse('node_add').success).toBe(false);
  });
});

describe('EventEnvelopeSchema', () => {
  it('accepts an envelope with optional ids', () => {
    expect(EventEnvelopeSchema.safeParse(event).success).toBe(true);
    expect(EventEnvelopeSchema.safeParse({ ...event, projectId: ID_A }).success).toBe(true);
  });

  it('rejects an unknown type or schemaVersion', () => {
    expect(EventEnvelopeSchema.safeParse({ ...event, type: 'nope' }).success).toBe(false);
    expect(EventEnvelopeSchema.safeParse({ ...event, schemaVersion: 2 }).success).toBe(false);
  });

  it('validates prompt_submit payloads', () => {
    const submit = (payload: object) =>
      EventEnvelopeSchema.safeParse({ ...event, type: 'prompt_submit', payload }).success;
    expect(submit({ hasAttachment: false, presetKey: 'sofa' })).toBe(true);
    expect(submit({})).toBe(false);
    expect(submit({ hasAttachment: false, presetKey: 'nope' })).toBe(false);
  });
});

describe('event batches', () => {
  const batch = (n: number) => ({ events: Array.from({ length: n }, () => event) });

  it('accepts 50 events and rejects 51', () => {
    expect(EventBatchRequestSchema.safeParse(batch(LIMITS.EVENT_BATCH_MAX)).success).toBe(true);
    expect(EventBatchRequestSchema.safeParse(batch(LIMITS.EVENT_BATCH_MAX + 1)).success).toBe(
      false,
    );
  });

  it('parses the response and rejects negative counts', () => {
    expect(EventBatchResponseSchema.safeParse({ accepted: 3, duplicates: 0 }).success).toBe(true);
    expect(EventBatchResponseSchema.safeParse({ accepted: -1, duplicates: 0 }).success).toBe(false);
  });
});

describe('identity signal payloads', () => {
  const parse = (type: string, payload: Record<string, unknown>) =>
    EventEnvelopeSchema.safeParse({ ...event, type, payload }).success;

  it('accepts an empty payload and unknown keys for every signal type', () => {
    for (const type of [
      'weight_dial_click',
      'meaning_point_set',
      'priority_drag_reorder',
      'weight_apply',
      'source_apply',
      'priority_apply',
      'draft_apply',
      'evidence_toggle',
      'flag_decision',
      'node_open',
    ]) {
      expect(parse(type, {})).toBe(true);
      expect(parse(type, { somethingNew: 1 })).toBe(true);
    }
  });

  it('accepts the documented fields', () => {
    expect(
      parse('weight_apply', { nodeId: 'k1', weightAi: 5, weightFinal: 9, reason: 'bolder' }),
    ).toBe(true);
    expect(
      parse('meaning_point_set', { nodeId: 'k1', padAi: { x: 0, y: 0 }, padFinal: { x: 3, y: 4 } }),
    ).toBe(true);
    expect(parse('priority_drag_reorder', { orderChanged: true, orderDelta: 2, n: 4 })).toBe(true);
    expect(parse('flag_decision', { nodeId: 'v1', state: 'kept', reason: '' })).toBe(true);
    expect(parse('draft_apply', { changed: false })).toBe(true);
  });

  it('rejects fields of the wrong type', () => {
    expect(parse('flag_decision', { state: 'maybe' })).toBe(false);
    expect(parse('weight_apply', { weightFinal: 'high' })).toBe(false);
    expect(parse('meaning_point_set', { padFinal: { x: 1 } })).toBe(false);
    expect(parse('draft_apply', { changed: 'yes' })).toBe(false);
  });
});
