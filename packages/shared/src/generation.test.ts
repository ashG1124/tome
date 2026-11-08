import { describe, expect, it } from 'vitest';
import { LIMITS } from './common.js';
import {
  AcceptAnswerResponseSchema,
  AdvanceJobRequestSchema,
  AdvanceJobResponseSchema,
  CreateRevisionRequestSchema,
  CreateRevisionResponseSchema,
  CreateSetRequestSchema,
  CreateSetResponseSchema,
  JobSchema,
  JobStatusSchema,
  JobStepSchema,
} from './generation.js';
import { ID_A, ID_B, answer, job, snapshot } from './testing/fixtures.js';

describe('job schemas', () => {
  it('parses a job and rejects unknown status', () => {
    expect(JobSchema.safeParse(job).success).toBe(true);
    expect(JobStatusSchema.safeParse('paused').success).toBe(false);
  });

  it('accepts a null nextStage when the job is done', () => {
    expect(JobSchema.safeParse({ ...job, status: 'succeeded', nextStage: null }).success).toBe(
      true,
    );
  });

  it('parses a step with an answer', () => {
    const step = {
      stage: 'image',
      status: 'succeeded',
      answer,
      provider: 'klein',
      fallbackUsed: false,
    };
    expect(JobStepSchema.safeParse(step).success).toBe(true);
  });
});

describe('CreateSetRequestSchema', () => {
  const req = { pageId: ID_A, prompt: 'a cat' };
  const withPrompt = (n: number) =>
    CreateSetRequestSchema.safeParse({ ...req, prompt: 'a'.repeat(n) }).success;

  it('accepts a prompt at the limit and rejects one over it', () => {
    expect(withPrompt(LIMITS.PROMPT_MAX)).toBe(true);
    expect(withPrompt(LIMITS.PROMPT_MAX + 1)).toBe(false);
  });

  it('rejects blank prompts and unknown preset keys', () => {
    expect(CreateSetRequestSchema.safeParse({ ...req, prompt: '  ' }).success).toBe(false);
    expect(CreateSetRequestSchema.safeParse({ ...req, presetKey: 'nope' }).success).toBe(false);
    expect(CreateSetRequestSchema.safeParse({ ...req, presetKey: 'sofa' }).success).toBe(true);
  });

  it('parses the response', () => {
    const set = { id: ID_A, position: 1, prompt: 'a cat', latestAnswer: null, answers: [] };
    expect(CreateSetResponseSchema.safeParse({ set, job }).success).toBe(true);
  });
});

describe('advance and revision', () => {
  it('accepts known stages only', () => {
    expect(AdvanceJobRequestSchema.safeParse({ stage: 'assemble' }).success).toBe(true);
    expect(AdvanceJobRequestSchema.safeParse({ stage: 'upload' }).success).toBe(false);
    const step = { stage: 'analyze', status: 'succeeded', provider: null, fallbackUsed: false };
    expect(AdvanceJobResponseSchema.safeParse({ job, step }).success).toBe(true);
  });

  it('parses a revision request and response', () => {
    const req = (baseAnswerId: string) =>
      CreateRevisionRequestSchema.safeParse({ baseAnswerId, nodes: snapshot }).success;
    expect(req(ID_B)).toBe(true);
    expect(req('x')).toBe(false);
    const res = { job, startStage: 'assemble', changes: [{ nodeId: 'k1', field: 'weight' }] };
    expect(CreateRevisionResponseSchema.safeParse(res).success).toBe(true);
  });

  it('only returns accepted status from accept', () => {
    const res = (status: string) =>
      AcceptAnswerResponseSchema.safeParse({ answer: { id: ID_B, number: 2, status } }).success;
    expect(res('accepted')).toBe(true);
    expect(res('draft')).toBe(false);
  });
});
