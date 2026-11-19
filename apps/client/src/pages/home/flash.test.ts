import { describe, expect, it } from 'vitest';
import { flashFromState } from './flash';

describe('flashFromState', () => {
  it('update·done 만 플래시로 읽는다', () => {
    expect(flashFromState({ flash: 'update' })).toBe('update');
    expect(flashFromState({ flash: 'done' })).toBe('done');
  });

  it('state 가 없거나 모르는 값이면 플래시가 없다', () => {
    expect(flashFromState(null)).toBeNull();
    expect(flashFromState(undefined)).toBeNull();
    expect(flashFromState({ flash: 'stack' })).toBeNull();
    expect(flashFromState({})).toBeNull();
  });
});
