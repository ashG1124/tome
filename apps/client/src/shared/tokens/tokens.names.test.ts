import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOKENS, tokenVar } from './index';

const css = readFileSync(resolve(import.meta.dirname, 'tokens.css'), 'utf8');

describe('TOKENS', () => {
  for (const name of Object.values(TOKENS)) {
    it(`${name} 은 tokens.css 에 정의돼 있다`, () => {
      expect(css).toContain(`${name}:`);
    });
  }

  it('tokenVar 는 var() 문자열을 만든다', () => {
    expect(tokenVar(TOKENS.colorPeachText)).toBe('var(--color-peach-text)');
  });
});
