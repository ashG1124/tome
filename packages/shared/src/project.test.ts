import { describe, expect, it } from 'vitest';
import { LIMITS } from './common.js';
import {
  CreateProjectRequestSchema,
  CreateProjectResponseSchema,
  DerivedFromSchema,
  FinishCandidatesResponseSchema,
  FinishProjectRequestSchema,
  PostProjectRequestSchema,
  PostProjectResponseSchema,
  ProjectListResponseSchema,
  ProjectSummarySchema,
  UpdateProjectRequestSchema,
  WorkspaceResponseSchema,
} from './project.js';
import { ID_A, ID_B, NOW, answer, job, project } from './testing/fixtures.js';

describe('project schemas', () => {
  it('parses a project summary and list', () => {
    expect(ProjectSummarySchema.safeParse(project).success).toBe(true);
    expect(ProjectListResponseSchema.safeParse({ projects: [project] }).success).toBe(true);
  });

  it('limits the title length to 60', () => {
    const title = (n: number) =>
      ProjectSummarySchema.safeParse({ ...project, title: 'a'.repeat(n) });
    expect(title(LIMITS.TITLE_MAX).success).toBe(true);
    expect(title(LIMITS.TITLE_MAX + 1).success).toBe(false);
  });

  it('allows an empty create request and limits the prompt', () => {
    const prompt = (n: number) =>
      CreateProjectRequestSchema.safeParse({ prompt: 'a'.repeat(n) }).success;
    expect(CreateProjectRequestSchema.safeParse({}).success).toBe(true);
    expect(prompt(LIMITS.PROMPT_MAX)).toBe(true);
    expect(prompt(LIMITS.PROMPT_MAX + 1)).toBe(false);
  });

  it('parses a create response with and without a job', () => {
    expect(CreateProjectResponseSchema.safeParse({ project }).success).toBe(true);
    const set = { id: ID_A, position: 1, prompt: 'p', latestAnswer: null, answers: [] };
    expect(CreateProjectResponseSchema.safeParse({ project, set, job }).success).toBe(true);
  });

  it('validates update requests', () => {
    expect(UpdateProjectRequestSchema.safeParse({ title: 'New', shelfPosition: 2 }).success).toBe(
      true,
    );
    expect(UpdateProjectRequestSchema.safeParse({ shelfPosition: -1 }).success).toBe(false);
  });

  it('parses a workspace response', () => {
    const ws = {
      project,
      pages: [{ id: ID_A, index: 0, setCount: 1 }],
      currentPageId: ID_A,
      sets: [{ id: ID_B, position: 1, prompt: 'p', latestAnswer: answer, answers: [answer] }],
    };
    expect(WorkspaceResponseSchema.safeParse(ws).success).toBe(true);
    expect(WorkspaceResponseSchema.safeParse({ ...ws, activeJob: job }).success).toBe(true);
    expect(WorkspaceResponseSchema.safeParse({ ...ws, currentPageId: 'x' }).success).toBe(false);
  });

  it('parses finish candidates', () => {
    expect(FinishCandidatesResponseSchema.safeParse({ answers: [answer] }).success).toBe(true);
  });

  it('requires a title when finishing and limits reason to 300', () => {
    const base = { title: 'Done', coverAnswerId: ID_A };
    const reason = (n: number) =>
      FinishProjectRequestSchema.safeParse({ ...base, reason: 'a'.repeat(n) }).success;
    expect(FinishProjectRequestSchema.safeParse(base).success).toBe(true);
    expect(FinishProjectRequestSchema.safeParse({ ...base, title: '  ' }).success).toBe(false);
    expect(reason(LIMITS.REASON_MAX)).toBe(true);
    expect(reason(LIMITS.REASON_MAX + 1)).toBe(false);
  });

  it('parses post request and response', () => {
    expect(PostProjectRequestSchema.safeParse({ posted: true }).success).toBe(true);
    expect(PostProjectResponseSchema.safeParse({ postedAt: NOW }).success).toBe(true);
    expect(PostProjectResponseSchema.safeParse({ postedAt: 'yesterday' }).success).toBe(false);
  });

  it('parses derivedFrom with a missing original', () => {
    const derived = (projectId: string) =>
      DerivedFromSchema.safeParse({ projectId, answerId: null, title: null }).success;
    expect(derived(ID_A)).toBe(true);
    expect(derived('x')).toBe(false);
  });
});
