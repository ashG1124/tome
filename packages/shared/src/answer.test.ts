import { describe, expect, it } from 'vitest';
import {
  AnswerSchema,
  CreateNodeCommentRequestSchema,
  NodeCommentSchema,
  PinAnswerRequestSchema,
  PromptSetSchema,
  UpdateVerificationRequestSchema,
} from './answer.js';
import { LIMITS } from './common.js';
import { ID_A, NOW, answer, creator } from './testing/fixtures.js';

describe('AnswerSchema', () => {
  it('accepts an accepted answer', () => {
    expect(AnswerSchema.safeParse(answer).success).toBe(true);
  });

  it('accepts a draft without a number and rejects number 0', () => {
    expect(AnswerSchema.safeParse({ ...answer, status: 'draft', number: null }).success).toBe(true);
    expect(AnswerSchema.safeParse({ ...answer, number: 0 }).success).toBe(false);
  });
});

describe('PromptSetSchema', () => {
  const set = { id: ID_A, position: 1, prompt: 'a', latestAnswer: null, answers: [] };
  const withPosition = (position: number) =>
    PromptSetSchema.safeParse({ ...set, position }).success;
  const withPrompt = (n: number) =>
    PromptSetSchema.safeParse({ ...set, prompt: 'a'.repeat(n) }).success;

  it('accepts positions 1 and 3 and rejects 0 and 4', () => {
    expect(PromptSetSchema.safeParse(set).success).toBe(true);
    expect(withPosition(LIMITS.SETS_PER_PAGE)).toBe(true);
    expect(withPosition(0)).toBe(false);
    expect(withPosition(LIMITS.SETS_PER_PAGE + 1)).toBe(false);
  });

  it('limits the prompt length', () => {
    expect(withPrompt(LIMITS.PROMPT_MAX)).toBe(true);
    expect(withPrompt(LIMITS.PROMPT_MAX + 1)).toBe(false);
  });
});

describe('pin and verification requests', () => {
  it('parses a pin request', () => {
    expect(PinAnswerRequestSchema.safeParse({ pinned: true }).success).toBe(true);
    expect(PinAnswerRequestSchema.safeParse({ pinned: 'yes' }).success).toBe(false);
  });

  it('requires exactly one of enabled or decision per node', () => {
    const parse = (n: object) => UpdateVerificationRequestSchema.safeParse({ nodes: [n] }).success;
    expect(parse({ id: 'v1', enabled: false })).toBe(true);
    expect(parse({ id: 'm1', decision: 'kept' })).toBe(true);
    expect(parse({ id: 'v1' })).toBe(false);
    expect(parse({ id: 'v1', enabled: true, decision: 'kept' })).toBe(false);
  });
});

describe('node comments', () => {
  it('parses a comment', () => {
    const comment = {
      id: ID_A,
      nodeId: 'k1',
      author: creator,
      body: 'hi',
      createdAt: NOW,
      mine: true,
    };
    expect(NodeCommentSchema.safeParse(comment).success).toBe(true);
  });

  it('accepts a 300-char body and rejects 301 or blank', () => {
    const req = (body: string) => CreateNodeCommentRequestSchema.safeParse({ nodeId: 'k1', body });
    expect(req('a'.repeat(LIMITS.COMMENT_MAX)).success).toBe(true);
    expect(req('a'.repeat(LIMITS.COMMENT_MAX + 1)).success).toBe(false);
    expect(req('   ').success).toBe(false);
  });
});
