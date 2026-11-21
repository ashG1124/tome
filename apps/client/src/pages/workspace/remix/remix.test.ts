import type { RemixCandidate } from '@tome/shared';
import { describe, expect, it } from 'vitest';
import { candidateListState, initialOf } from './remix';

const LIND: RemixCandidate = {
  id: '3e7a1c9d-4b2f-4d8e-a6c5-1f0b2d3e4a5c',
  displayName: 'Lind',
  bio: 'Quiet shapes, loud colors.',
  avatarUrl: null,
  favorite: false,
  provisional: false,
};

describe('candidateListState', () => {
  it('받는 중이면 loading', () => {
    expect(candidateListState({ isPending: true, isError: false, data: undefined })).toEqual({
      kind: 'loading',
    });
  });

  it('0명이거나 못 받았으면 empty(S-04)', () => {
    expect(
      candidateListState({ isPending: false, isError: false, data: { creators: [] } }),
    ).toEqual({ kind: 'empty' });
    expect(candidateListState({ isPending: false, isError: true, data: undefined })).toEqual({
      kind: 'empty',
    });
  });

  it('후보가 있으면 받은 순서 그대로 list', () => {
    expect(
      candidateListState({ isPending: false, isError: false, data: { creators: [LIND] } }),
    ).toEqual({ kind: 'list', creators: [LIND] });
  });
});

describe('initialOf', () => {
  it('앞뒤 공백을 빼고 첫 글자를 대문자로, 빈 이름은 빈 문자열', () => {
    expect(initialOf('  lind ')).toBe('L');
    expect(initialOf('마라')).toBe('마');
    expect(initialOf('   ')).toBe('');
  });
});
