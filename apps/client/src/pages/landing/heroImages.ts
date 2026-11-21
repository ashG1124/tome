/**
 * 히어로에 흩어진 이미지 배치표(시안 3445:27232, 폭 1920 기준 디자인 단위).
 * x·y 는 페이지 맨 위(헤더 위쪽) 기준 좌표다. 화면에서는 화면 폭에 비례해 줄여 그린다.
 * file 은 onboarding 폴더 안 파일 이름. 모양(둥근 모서리·회전·잘라내기)은 이미지에 이미 들어 있다.
 */
export interface HeroImage {
  file: string;
  /** 시안 노드 id */
  node: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 모서리 반지름(자리 표시용) */
  radius: number;
  opacity: number;
}

export const HERO_IMAGES: readonly HeroImage[] = [
  {
    file: 'landing-hero-01.webp',
    node: '3445:27233',
    x: 977,
    y: 247,
    w: 203,
    h: 174.78,
    radius: 12.744,
    opacity: 1,
  },
  {
    file: 'landing-hero-02.webp',
    node: '3445:27234',
    x: 1387,
    y: 487,
    w: 215,
    h: 258,
    radius: 13.34,
    opacity: 1,
  },
  {
    file: 'landing-hero-03.webp',
    node: '3445:27235',
    x: 1697,
    y: 410,
    w: 247,
    h: 168,
    radius: 14,
    opacity: 1,
  },
  {
    file: 'landing-hero-04.webp',
    node: '3445:27236',
    x: 1535,
    y: 171,
    w: 177,
    h: 150,
    radius: 14,
    opacity: 1,
  },
  {
    file: 'landing-hero-05.webp',
    node: '3445:27237',
    x: -52,
    y: 220,
    w: 177,
    h: 150,
    radius: 14,
    opacity: 1,
  },
  {
    file: 'landing-hero-06.webp',
    node: '3445:27238',
    x: 860,
    y: 61,
    w: 159,
    h: 219,
    radius: 14,
    opacity: 1,
  },
  {
    file: 'landing-hero-07.webp',
    node: '3445:27239',
    x: 426,
    y: 208,
    w: 272.531,
    h: 324,
    radius: 11.813,
    opacity: 1,
  },
  {
    file: 'landing-hero-08.webp',
    node: '3445:27240',
    x: 114,
    y: 538,
    w: 179,
    h: 189,
    radius: 14,
    opacity: 1,
  },
  {
    file: 'landing-hero-09.webp',
    node: '3445:27241',
    x: 653,
    y: 854,
    w: 113.651,
    h: 120,
    radius: 8.889,
    opacity: 0.5,
  },
  {
    file: 'landing-hero-10.webp',
    node: '3445:27242',
    x: 919,
    y: 945,
    w: 256,
    h: 348,
    radius: 14,
    opacity: 1,
  },
  {
    file: 'landing-hero-11.webp',
    node: '3445:27243',
    x: 241,
    y: 697,
    w: 256,
    h: 174,
    radius: 14,
    opacity: 1,
  },
  {
    file: 'landing-hero-12.webp',
    node: '3445:27244',
    x: 1313,
    y: 1189,
    w: 258,
    h: 335,
    radius: 14,
    opacity: 1,
  },
  {
    file: 'landing-hero-13.webp',
    node: '3445:27245',
    x: 1342,
    y: 887,
    w: 213,
    h: 150,
    radius: 12.704,
    opacity: 1,
  },
  {
    file: 'landing-hero-14.webp',
    node: '3445:27246',
    x: 1738,
    y: 865,
    w: 218,
    h: 343,
    radius: 14,
    opacity: 1,
  },
  {
    file: 'landing-hero-15.webp',
    node: '3445:27247',
    x: 421,
    y: 1144,
    w: 346,
    h: 562,
    radius: 14,
    opacity: 1,
  },
  {
    file: 'landing-hero-16.webp',
    node: '3445:27248',
    x: -99,
    y: 1058,
    w: 354,
    h: 184,
    radius: 14,
    opacity: 1,
  },
];

/** 시안 폭·구간 높이(디자인 단위) */
export const LANDING_LAYOUT = {
  designWidth: 1920,
  headerHeight: 61,
  /** 헤더 아래 히어로 높이: 시안 y 61 ~ 1719 */
  heroHeight: 1658,
  /** 첫 화면 높이. 이 안에 시작하는 이미지만 바로 불러온다 */
  firstScreen: 1080,
} as const;

/** 이미지 크기에 비례한 깊이(0.6~1.5). 클수록 가깝게 느껴져 더 많이 움직인다. 같은 입력이면 항상 같은 값 */
export function heroDepth(image: HeroImage): number {
  const area = image.w * image.h;
  const max = 346 * 562;
  return 0.6 + 0.9 * Math.min(1, area / max);
}
