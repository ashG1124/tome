import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AXES,
  NodeSchema,
  NodeSnapshotSchema,
  PadSchema,
  VerificationSchema,
} from './node.js';
import { keywordNode, snapshot } from './testing/fixtures.js';

const pad = { x: 0, y: 0, xAxis: ['Textured', 'Smooth'], yAxis: ['Horizon', 'Surrounding'] };

describe('PadSchema', () => {
  it('accepts the range edges', () => {
    expect(PadSchema.safeParse({ ...pad, x: -5, y: 5 }).success).toBe(true);
  });

  it('rejects coordinates outside -5..5 and non-integers', () => {
    expect(PadSchema.safeParse({ ...pad, x: 6 }).success).toBe(false);
    expect(PadSchema.safeParse({ ...pad, y: -6 }).success).toBe(false);
    expect(PadSchema.safeParse({ ...pad, x: 1.5 }).success).toBe(false);
  });

  it('rejects axis names that break the pattern', () => {
    expect(PadSchema.safeParse({ ...pad, xAxis: ['1Bad', 'Smooth'] }).success).toBe(false);
    expect(PadSchema.safeParse({ ...pad, xAxis: ['A'.repeat(31), 'Smooth'] }).success).toBe(false);
    expect(PadSchema.safeParse({ ...pad, xAxis: ['A'.repeat(30), 'Soft one'] }).success).toBe(true);
  });

  it('default axes satisfy the schema', () => {
    const parsed = PadSchema.safeParse({
      x: 0,
      y: 0,
      xAxis: [...DEFAULT_AXES.xAxis],
      yAxis: [...DEFAULT_AXES.yAxis],
    });
    expect(parsed.success).toBe(true);
  });
});

describe('NodeSchema', () => {
  it('accepts a keyword node', () => {
    expect(NodeSchema.safeParse(keywordNode).success).toBe(true);
  });

  it('accepts weight 0 and 9 and rejects 10 or -1', () => {
    expect(NodeSchema.safeParse({ ...keywordNode, weight: 0 }).success).toBe(true);
    expect(NodeSchema.safeParse({ ...keywordNode, weight: 9 }).success).toBe(true);
    expect(NodeSchema.safeParse({ ...keywordNode, weight: 10 }).success).toBe(false);
    expect(NodeSchema.safeParse({ ...keywordNode, weight: -1 }).success).toBe(false);
  });

  it('rejects ids outside the id format', () => {
    expect(NodeSchema.safeParse({ ...keywordNode, id: 'x1' }).success).toBe(false);
  });
});

describe('NodeSnapshotSchema', () => {
  it('accepts a snapshot', () => {
    expect(NodeSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('rejects duplicate node ids', () => {
    const dup = { ...snapshot, nodes: [keywordNode, keywordNode] };
    expect(NodeSnapshotSchema.safeParse(dup).success).toBe(false);
  });

  it('rejects an unknown schemaVersion', () => {
    expect(NodeSnapshotSchema.safeParse({ ...snapshot, schemaVersion: 2 }).success).toBe(false);
  });
});

describe('VerificationSchema', () => {
  it('accepts a done verification and rejects unknown status', () => {
    const base = { criteria: [], mismatches: [] };
    expect(VerificationSchema.safeParse({ ...base, status: 'done' }).success).toBe(true);
    expect(VerificationSchema.safeParse({ ...base, status: 'pending' }).success).toBe(false);
  });
});
