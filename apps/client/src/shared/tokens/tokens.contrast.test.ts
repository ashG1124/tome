import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// vitest는 `?raw`로 가져온 .css를 빈 문자열로 돌려줘서(CSS 처리 기본값) 파일을 직접 읽는다.
const css = readFileSync(resolve(import.meta.dirname, 'tokens.css'), 'utf8');

/** `--name: value;` 줄을 읽어 이름→값 표로 만든다. 주석은 먼저 지운다. */
function parseTokens(source: string): Map<string, string> {
  const tokens = new Map<string, string>();
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of withoutComments.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(match[1] as string, (match[2] as string).trim());
  }
  return tokens;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`6자리 hex가 아님: ${hex}`);
  const n = parseInt(m[1] as string, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG 2.x 상대 휘도 */
function luminance(hex: string): number {
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x 대비비 (1 ~ 21) */
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const tokens = parseTokens(css);

function color(name: string): string {
  const value = tokens.get(name);
  if (!value) throw new Error(`토큰 없음: ${name}`);
  return value;
}

const TEXT_MIN = 4.5;
const BORDER_MIN = 3.0;

describe('tokens.css 대비 (WCAG 2.x)', () => {
  const textOnBackgrounds = [
    '--color-font-strong',
    '--color-font-main-text',
    '--color-font-sub-text',
    '--color-font-helper-text',
    '--color-peach-text',
    '--color-orange-text',
  ];
  const backgrounds = [
    '--color-background-default',
    '--color-background-weak',
    '--color-background-lower',
    '--color-fill-brand-weak',
  ];

  for (const text of textOnBackgrounds) {
    for (const bg of backgrounds) {
      it(`${text} 는 ${bg} 위에서 ${TEXT_MIN} 이상`, () => {
        expect(contrast(color(text), color(bg))).toBeGreaterThanOrEqual(TEXT_MIN);
      });
    }
  }

  for (const fill of ['--color-fill-brand', '--color-fill-brand-weak', '--color-fill-brand-med']) {
    it(`--color-font-main-text 는 ${fill} 위에서 ${TEXT_MIN} 이상`, () => {
      expect(contrast(color('--color-font-main-text'), color(fill))).toBeGreaterThanOrEqual(
        TEXT_MIN,
      );
    });
  }

  it(`--color-font-point 는 --color-fill-point 위에서 ${TEXT_MIN} 이상`, () => {
    expect(
      contrast(color('--color-font-point'), color('--color-fill-point')),
    ).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it(`--color-font-on-fill 은 --color-fill-neutral 위에서 ${TEXT_MIN} 이상`, () => {
    expect(
      contrast(color('--color-font-on-fill'), color('--color-fill-neutral')),
    ).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  for (const bg of backgrounds) {
    it(`--color-border-input 은 ${bg} 위에서 ${BORDER_MIN} 이상`, () => {
      expect(contrast(color('--color-border-input'), color(bg))).toBeGreaterThanOrEqual(BORDER_MIN);
    });
  }

  it('노랑 글자 토큰(--color-font-brand)이 없다', () => {
    expect(tokens.has('--color-font-brand')).toBe(false);
  });
});
