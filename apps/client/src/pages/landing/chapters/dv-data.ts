/**
 * DERIVE 챕터 연출용 데모 데이터(가짜 영어 문구와 이미지 해시).
 * 기준안 좌표(1728×1117 기준)와 같은 방식으로, 아래 좌표·크기는 1920 폭 판(board) 안의 연출용 숫자다.
 * (DERIVE 판은 1920×1440 이라 가로 1920 기준이다.)
 */

/** 프로젝트 카드: [제목, 표지 해시, 제작자 아바타 해시] */
export const PROJECTS: ReadonlyArray<readonly [string, string, string]> = [
  ['Cyber-cympathy', '56749f8139', 'd605ac6f3e'],
  ['Lifestyle furniture', 'df5338510d', '12f4c44c5d'],
  ['Nomad workspace', 'c28b3a9f97', 'c777afea92'],
  ['Hydroponic cell', '08856aba67', '0d3bf320ae'],
  ['Urban Trail', 'aea7702844', '87591e9925'],
  ['Graphic identity / type', '7aa5e92d00', '8e962914ec'],
  ['Kinetic craft', '9355f14092', '1c794c794a'],
  ['Cozy-Tea set', 'a34ca6b03f', '10b91cfae4'],
  ['Mythical kitchen', '13d1f96c08', '5db1a022a9'],
];

/** 줌인 되는 카드가 들어 있는 자리(첫 줄의 다섯째) */
export const HERO_INDEX = 4;

/** 크리에이터 카드: [이름, 역할, 아바타 해시] */
export const CREATORS: ReadonlyArray<readonly [string, string, string]> = [
  ['Lind', 'Global Implementation Manager', 'b1b461fa76'],
  ['Ceredic', 'Dynamic Interactions Engineer', '29583e47d1'],
  ['Nichole', 'Direct Optimization Engineer', 'd9d4cd6dbb'],
  ['Jay', 'Human Assurance Supervisor', 'f742fd4802'],
  ['Judy', 'International Response Designer', '3ac573addf'],
  ['Hayden', 'Lead Security Executive', '8a41b7ff58'],
  ['Milla', 'Senior Data Strategist', 'ac8ce4e084'],
  ['Rose', 'Regional Creative Strategist', '1a25e99d78'],
  ['Erick', 'Product Implementation Director', '2a038b3267'],
  ['Nick', 'International Intranet Coordinator', '49fade779e'],
  ['Posy', 'National Usability Facilitator', '2a55d56d69'],
];

/** 주제 카드: [제목, 더 있는 개수, 썸네일 4장 해시] */
export const TOPICS: ReadonlyArray<readonly [string, string, readonly string[]]> = [
  ['Sculptural architecture', '+16', ['bbf034654f', '60f130a662', '5399dca0da', 'c0a9dd8813']],
  ['Urban Trail', '+34', ['93d600d044', 'b60292c4d1', 'b1456b5e93', '5dc8d38496']],
  ['MV Concept Shots', '+25', ['51a21c14c1', '4ca01d79f8', '5799199560', 'b2434f575e']],
  ['Warm Task Lighting', '+98', ['981a55e445', 'fa1d24f101', '0cfd8c3593', '75af4f791c']],
  ['Concept Car Sketch', '+95', ['ddf97684fb', '3d65773a10', '9281d8cd52', '3d3e4a96a9']],
  ['Sci-Fi Film Still', '+95', ['baa738d85c', '342c460c17', '43dda4befb', 'f927856d8b']],
  ['Album Cover Art', '+95', ['ddf97684fb', '0623edb5cb', '9281d8cd52', 'b0ace6c848']],
  ['Development of modern park', '+102', ['854975f611', 'ed4b98c44e', '51d204c090', '14d31beab2']],
];

/** 노드 칩: [위쪽 좌표, 높이, 글자] — 열 안에서의 위치(판 좌표) */
export type Chip = readonly [number, number, string];

/** 노드 지도 열 하나: 단계 번호, 열의 왼쪽 좌표, 제목 문구 ID */
export interface MapColumn {
  step: number;
  x: number;
  title: 'ON-37d' | 'ON-37e' | 'ON-37f';
}
/** 열의 왼쪽 좌표 */
export const COL3_X = -51.84;
export const COL4_X = 291;
export const COL5_X = 633.8;
export const MAP_COLUMNS: readonly MapColumn[] = [
  { step: 3, x: COL3_X, title: 'ON-37d' },
  { step: 4, x: COL4_X, title: 'ON-37e' },
  { step: 5, x: COL5_X, title: 'ON-37f' },
];

/** 3단계 열: 근거 문장 7개와 켜짐 여부 */
export const EVIDENCE_LABEL = ['Sentence supporting the answer', 224] as const;
export const EVIDENCE: ReadonlyArray<readonly [string, boolean]> = [
  ['Hybrids pair trail soles with running uppers.', true],
  ['Recycled knit allows a one-piece upper.', false],
  ['Knit breathes well but wears fast.', true],
  ['Carved foam makes chunky soles lighter.', true],
  ['Shallow lugs walk better on pavement.', false],
  ['Tonal colour highlights material texture.', true],
  ['Commuters report forefoot and heel pain.', true],
];
export const EVIDENCE_TOP = 248.9;
export const EVIDENCE_PITCH = 91.13;
export const EVIDENCE_H = 73.77;

/** 4단계 열: 묶음 이름과 라벨 위치, 칩 */
export const DRAFT_GROUPS: ReadonlyArray<{
  label: string;
  top: number;
  chips: readonly Chip[];
}> = [
  {
    label: 'Silhouette & Proportion',
    top: 219.7,
    chips: [
      [244.6, 50.8, 'Low-cut runner silhouette'],
      [312.7, 50.8, 'Slim upper, thick sole'],
      [380.9, 50.8, 'Flared heel for stability'],
    ],
  },
  {
    label: 'Material & Colour',
    top: 466.4,
    chips: [
      [491.3, 50.8, 'One-piece recycled knit uppe'],
      [559.4, 50.8, 'Carved off-white foam midsole'],
      [627.6, 73.8, 'Warm grey and sand tonal palette'],
    ],
  },
  {
    label: 'Use & Details',
    top: 736,
    chips: [
      [761, 50.8, 'Shallow-lug outsole'],
      [829.1, 50.8, 'Quick lace and heel pull tab'],
      [897.3, 50.8, 'Wide last, padded heel'],
    ],
  },
];

/** 5단계 열: 검증 기준 카드와 어긋난 점 */
export const CRITERIA_LABEL = ['Verification criteria', 219.7] as const;
export const CRITERIA = [
  'Keywords reflected',
  'Material realism',
  'Volume vs lightness',
  'Fit for use scene',
] as const;
export const DISCREPANCIES = {
  label: 'Discrepancies',
  top: 439.2,
  chips: [
    [464.2, 50.8, 'Sole looks too heavy'],
    [532.3, 50.8, 'No water protection shown'],
    [600.4, 50.8, 'Palette leans cool grey'],
  ] as readonly Chip[],
};

/** 판 위 이미지 칸: [왼쪽, 위, 너비, 높이] (지도 좌표) */
export const SHOT_BOX = [1052.55, 229.2, 514.23, 396.16] as const;
export const MY_BOX = [1207.56, 645.79, 514.57, 359.74] as const;
