/** TS 코드에서 쓰는 토큰 이름. 값은 tokens.css 에 있다. */
export const TOKENS = {
  colorPeachText: '--color-peach-text',
  colorFontHelperText: '--color-font-helper-text',
  colorFontSubText: '--color-font-sub-text',
} as const;

export type TokenName = (typeof TOKENS)[keyof typeof TOKENS];

export function tokenVar(name: TokenName): string {
  return `var(${name})`;
}

export const CANVAS_GEOMETRY_TOKENS = {
  nodeWidth: '--canvas-node-width',
  nodeHeight: '--canvas-node-height',
  answerWidth: '--canvas-answer-width',
  columnGap: '--canvas-column-gap',
  rowGap: '--canvas-row-gap',
  setGap: '--canvas-set-gap',
  headerHeight: '--canvas-header-height',
} as const;
