import { describe, expect, it } from 'vitest';
import { isPublicAnswer } from './answers.service';

const at = (s: string) => new Date(`2026-11-18T${s}Z`);
const project = { postedAt: at('12:00:00'), finishedAt: at('11:00:00') };

describe('isPublicAnswer', () => {
  it('is public when accepted before the finish time', () => {
    expect(
      isPublicAnswer(project, {
        status: 'accepted',
        createdAt: at('09:00:00'),
        acceptedAt: at('10:00:00'),
      }),
    ).toBe(true);
  });

  it('is private when created before finishing but accepted after it', () => {
    expect(
      isPublicAnswer(project, {
        status: 'accepted',
        createdAt: at('10:00:00'),
        acceptedAt: at('11:30:00'),
      }),
    ).toBe(false);
  });

  it('is private when created after finishing', () => {
    expect(
      isPublicAnswer(project, {
        status: 'accepted',
        createdAt: at('11:30:00'),
        acceptedAt: at('11:30:00'),
      }),
    ).toBe(false);
  });

  it('falls back to createdAt when acceptedAt is null', () => {
    const base = { status: 'accepted', acceptedAt: null };
    expect(isPublicAnswer(project, { ...base, createdAt: at('10:00:00') })).toBe(true);
    expect(isPublicAnswer(project, { ...base, createdAt: at('11:30:00') })).toBe(false);
  });

  it('is private when not posted, not finished, or not accepted', () => {
    const answer = { status: 'accepted', createdAt: at('09:00:00'), acceptedAt: at('10:00:00') };
    expect(isPublicAnswer({ ...project, postedAt: null }, answer)).toBe(false);
    expect(isPublicAnswer({ ...project, finishedAt: null }, answer)).toBe(false);
    expect(isPublicAnswer(project, { ...answer, status: 'draft' })).toBe(false);
  });
});
