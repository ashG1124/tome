/**
 * 히어로 사진 콜라주 배치. 기준안 좌표(1728×1117 기준이 아니라 시안 폭 1920 기준, 헤더 아래 원점).
 * depth 는 스크롤 시차(깊을수록 많이 움직임)와 떠다니는 정도에 곱한다.
 */
export interface HeroTile {
  image: string;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  depth: number;
  opacity?: number;
}

export const HERO_TILES: readonly HeroTile[] = [
  { image: 'ob2-h_r3.webp', x: 977, y: 247, w: 203, h: 175, r: 12.7, depth: 0.35 },
  { image: 'ob2-h_r4.webp', x: 1387, y: 487, w: 215, h: 258, r: 13.3, depth: 0.75 },
  { image: 'ob2-h_r5.webp', x: 1697, y: 410, w: 247, h: 168, r: 14, depth: 0.5 },
  { image: 'ob2-h_r6.webp', x: 1535, y: 171, w: 177, h: 150, r: 14, depth: 0.3 },
  { image: 'ob2-h_r6.webp', x: -52, y: 220, w: 177, h: 150, r: 14, depth: 0.4 },
  { image: 'ob2-h_r7.webp', x: 860, y: 61, w: 159, h: 219, r: 14, depth: 0.45 },
  { image: 'ob2-h_r8.webp', x: 426, y: 208, w: 273, h: 324, r: 11.8, depth: 0.85 },
  { image: 'ob2-h_r10.webp', x: 114, y: 538, w: 179, h: 189, r: 14, depth: 0.4 },
  { image: 'ob2-h2_r23.webp', x: 653, y: 854, w: 114, h: 120, r: 8.9, depth: 0.25, opacity: 0.5 },
  { image: 'ob2-h_r13.webp', x: 919, y: 945, w: 256, h: 348, r: 14, depth: 0.7 },
  { image: 'ob2-h2_r14.webp', x: 241, y: 697, w: 256, h: 174, r: 14, depth: 0.45 },
  { image: 'ob2-h_r15.webp', x: 1313, y: 1189, w: 258, h: 335, r: 14, depth: 0.6 },
  { image: 'ob2-h2_r19.webp', x: 1342, y: 887, w: 213, h: 150, r: 12.7, depth: 0.35 },
  { image: 'ob2-h_r16.webp', x: 1738, y: 865, w: 218, h: 343, r: 14, depth: 0.8 },
  { image: 'ob2-h_r17.webp', x: 421, y: 1144, w: 346, h: 562, r: 14, depth: 0.9 },
  { image: 'ob2-h_r18.webp', x: -99, y: 1058, w: 354, h: 184, r: 14, depth: 0.55 },
];
