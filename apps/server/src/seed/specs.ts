// 시드 콘텐츠 정의(이름·프롬프트·토픽 제목·목표 프로필). 이미지는 실제 AI 생성 결과다:
// #112 에서 db:seed:generate 로 한 번 만들어 prisma/seed/project-images 에 커밋했다.
import type { PresetKey } from '@tome/shared';

export interface ProfileTarget {
  /** 평균 조작 강도(+ Bold) */
  A: number;
  /** 협업 관계(+ Dominance) */
  B: number;
  /** 의사결정 기준(+ Evidence-based, ADR-039) */
  C: number;
  /** 방향성(+ Divergent) */
  D: number;
}

export interface SetSpec {
  /** 확정(accepted) 버전 수 */
  versions: number;
  /** 확정 전에 버려진 시도 수(방향성 D 의 시도 수에 들어간다) */
  discarded: number;
  /** 세트에서 건드린 서로 다른 노드 수(방향성 D 의 key 수) */
  keys: number;
}

export type TopicKey = 'urban-shoes' | 'reading-space' | 'eco-library' | 'calm-workspace';

export interface ProjectSpec {
  key: string;
  title: string;
  prompt: string;
  presetKey?: PresetKey;
  topic?: TopicKey;
  /** keyword 자리 {k1}~{k4} 가 한 번씩 들어간 주제 문장 */
  subject: string;
  keywords: [string, string, string, string];
  attributes: [string, string, string, string];
  sets: SetSpec[];
  /** 예전 자리표시 이미지의 색 번호(0~359). 지금은 안 쓴다(실제 이미지로 교체됨) */
  hue: number;
}

export interface CreatorSpec {
  kind: 'seed' | 'persona';
  /** seed 는 seedOrder, persona 는 1~3 번 */
  order: number;
  target: ProfileTarget;
  /** 이벤트 총 개수(창작자당 60~150) */
  eventTotal: number;
  /** 이유 문자열이 있는 조작 비율 목표 */
  reasonedRatio: number;
  /** 첫 이벤트 날짜(UTC, 일 단위 오프셋) */
  startDay: number;
  projects: ProjectSpec[];
}

export const TOPICS: { key: TopicKey; title: string }[] = [
  { key: 'urban-shoes', title: 'How can I make urban-style shoes' },
  { key: 'reading-space', title: 'Make a cozy reading space' },
  { key: 'eco-library', title: 'Design an eco-friendly library' },
  { key: 'calm-workspace', title: 'Craft a calm minimal workspace' },
];

const s = (versions: number, discarded: number, keys: number): SetSpec => ({
  versions,
  discarded,
  keys,
});

export const CREATOR_SPECS: CreatorSpec[] = [
  {
    kind: 'seed',
    order: 1,
    target: { A: 70, B: 60, C: 40, D: 30 },
    eventTotal: 120,
    reasonedRatio: 0.8,
    startDay: 0,
    projects: [
      {
        key: 'mara-1',
        title: 'Neon stage',
        prompt:
          'A neon-lit music video scene of a singer walking through rainy Seoul streets at night, cinematic wide shot',
        presetKey: 'music-video',
        topic: 'urban-shoes',
        subject: 'A {k1} of a {k2} walking through {k3}, {k4}, cinematic wide shot',
        keywords: [
          'neon-lit music video scene',
          'singer',
          'rainy Seoul streets at night',
          'glowing reflections',
        ],
        attributes: [
          'neon magenta glow',
          'wet asphalt sheen',
          'wide cinematic framing',
          'shallow haze',
        ],
        sets: [s(3, 1, 7), s(2, 1, 7)],
        hue: 300,
      },
      {
        key: 'mara-2',
        title: 'Bold poster',
        prompt:
          'A bold concert poster with saturated magenta and cyan shapes, flat graphic style, strong diagonal layout',
        topic: 'urban-shoes',
        subject: 'A {k1} with {k2}, {k3}, {k4}',
        keywords: [
          'bold concert poster',
          'saturated magenta and cyan shapes',
          'flat graphic style',
          'strong diagonal layout',
        ],
        attributes: [
          'hard edges',
          'high contrast palette',
          'centered focal shape',
          'energetic rhythm',
        ],
        sets: [s(3, 1, 7), s(2, 1, 7)],
        hue: 320,
      },
      {
        key: 'mara-3',
        title: 'Chrome sculpture',
        prompt:
          'A gleaming chrome sculpture of a twisting ribbon on a dark studio plinth, dramatic rim light',
        subject: 'A {k1} with a {k2} on a {k3}, {k4}',
        keywords: [
          'chrome sculpture',
          'twisting ribbon form',
          'dark studio plinth',
          'dramatic rim light',
        ],
        attributes: ['mirror reflections', 'polished metal', 'low camera angle', 'monumental calm'],
        sets: [s(3, 1, 7), s(2, 1, 7)],
        hue: 210,
      },
    ],
  },
  {
    kind: 'seed',
    order: 2,
    target: { A: -55, B: -65, C: 20, D: -40 },
    eventTotal: 80,
    reasonedRatio: 0.5,
    startDay: 1,
    projects: [
      {
        key: 'dove-1',
        title: 'Warm sofa',
        prompt:
          'A cozy mid-century sofa in a sunlit living room, warm natural tones, interior photo',
        presetKey: 'sofa',
        topic: 'reading-space',
        subject: 'A cozy {k1} in a {k2}, {k3}, {k4}',
        keywords: [
          'mid-century sofa',
          'sunlit living room',
          'warm natural tones',
          'interior photo',
        ],
        attributes: ['soft window light', 'woven fabric', 'balanced composition', 'relaxed mood'],
        sets: [s(2, 0, 2), s(2, 0, 2)],
        hue: 30,
      },
      {
        key: 'dove-2',
        title: 'Soft lamp',
        prompt:
          'A soft linen-shaded table lamp beside an armchair, warm evening tones, interior photo',
        topic: 'reading-space',
        subject: 'A soft {k1} beside an {k2}, {k3}, {k4}',
        keywords: ['linen-shaded table lamp', 'armchair', 'warm evening tones', 'interior photo'],
        attributes: ['amber glow', 'textured linen', 'close side view', 'quiet mood'],
        sets: [s(2, 0, 2), s(1, 0, 2)],
        hue: 40,
      },
      {
        key: 'dove-3',
        title: 'Quiet reading nook',
        prompt:
          'A quiet reading nook on a window seat with a wool blanket and stacked books, soft morning light',
        topic: 'reading-space',
        subject: 'A quiet {k1} on a {k2} with {k3}, {k4}',
        keywords: [
          'reading nook',
          'window seat',
          'wool blanket and stacked books',
          'soft morning light',
        ],
        attributes: ['diffused daylight', 'knitted wool', 'gentle depth', 'calm mood'],
        sets: [s(2, 0, 2), s(1, 0, 2)],
        hue: 50,
      },
    ],
  },
  {
    kind: 'seed',
    order: 3,
    target: { A: 10, B: 20, C: 75, D: -55 },
    eventTotal: 100,
    reasonedRatio: 0.9,
    startDay: 2,
    projects: [
      {
        key: 'rhys-1',
        title: 'Eco library',
        prompt:
          'A sustainable eco-friendly library with wooden structures, green plants, and soft natural light',
        presetKey: 'eco-library',
        topic: 'eco-library',
        subject: 'A sustainable {k1} with {k2}, {k3}, and {k4}',
        keywords: [
          'eco-friendly library',
          'wooden structures',
          'green plants',
          'soft natural light',
        ],
        attributes: ['timber grain', 'living greenery', 'airy open plan', 'hushed focus'],
        sets: [s(1, 0, 2), s(2, 0, 2)],
        hue: 130,
      },
      {
        key: 'rhys-2',
        title: 'Modular shelf',
        prompt:
          'A modular oak shelving system with adjustable panels in a bright studio, clean product photo',
        topic: 'eco-library',
        subject: 'A {k1} with {k2} in a {k3}, {k4}',
        keywords: [
          'modular oak shelving system',
          'adjustable panels',
          'bright studio',
          'clean product photo',
        ],
        attributes: ['even daylight', 'oak veneer', 'orthogonal framing', 'orderly mood'],
        sets: [s(1, 0, 2), s(1, 0, 2)],
        hue: 90,
      },
      {
        key: 'rhys-3',
        title: 'Daylight desk',
        prompt:
          'A tidy daylight desk by a large window with a notebook and a small plant, natural light',
        topic: 'calm-workspace',
        subject: 'A tidy {k1} by a {k2} with a {k3}, {k4}',
        keywords: ['daylight desk', 'large window', 'notebook and a small plant', 'natural light'],
        attributes: ['north light', 'matte paper', 'top-down view', 'focused mood'],
        sets: [s(1, 0, 2), s(1, 0, 2)],
        hue: 160,
      },
    ],
  },
  {
    kind: 'seed',
    order: 4,
    target: { A: 40, B: 10, C: -55, D: 75 },
    eventTotal: 140,
    reasonedRatio: 0.4,
    startDay: 3,
    projects: [
      {
        key: 'isla-1',
        title: 'Cyber sneaker',
        prompt:
          'A pair of sneakers redesigned in a cyberpunk neon style, side view on a clean background',
        presetKey: 'sneaker',
        topic: 'urban-shoes',
        subject: 'A pair of {k1} redesigned in a {k2}, {k3} on a {k4}',
        keywords: ['sneakers', 'cyberpunk neon style', 'side view', 'clean background'],
        attributes: ['neon edge glow', 'glossy mesh', 'three-quarter tilt', 'futuristic mood'],
        sets: [s(3, 2, 10), s(3, 2, 10)],
        hue: 270,
      },
      {
        key: 'isla-2',
        title: 'Street mural',
        prompt:
          'A vivid street mural of a leaping fox on a brick wall, spray paint texture, golden hour',
        topic: 'urban-shoes',
        subject: 'A vivid {k1} of a {k2} on a {k3}, {k4}',
        keywords: ['street mural', 'leaping fox', 'brick wall', 'golden hour'],
        attributes: ['spray paint texture', 'rough brick', 'wide street view', 'joyful mood'],
        sets: [s(3, 2, 10), s(3, 2, 10)],
        hue: 15,
      },
      {
        key: 'isla-3',
        title: 'Kinetic logo',
        prompt:
          'A kinetic abstract logo mark made of orbiting colorful rings on a plain background',
        subject: 'A {k1} made of {k2} on a {k3}, {k4}',
        keywords: [
          'kinetic logo mark',
          'orbiting colorful rings',
          'plain background',
          'abstract style',
        ],
        attributes: ['motion blur trails', 'vivid gradients', 'centered mark', 'playful mood'],
        sets: [s(3, 2, 10)],
        hue: 190,
      },
    ],
  },
  {
    kind: 'seed',
    order: 5,
    target: { A: -30, B: -10, C: -30, D: -20 },
    eventTotal: 70,
    reasonedRatio: 0.7,
    startDay: 4,
    projects: [
      {
        key: 'teo-1',
        title: 'Studio lamp',
        prompt: 'A minimalist studio desk lamp glowing warmly on a wooden desk, soft product photo',
        presetKey: 'desk-lamp',
        topic: 'calm-workspace',
        subject: 'A {k1} {k2} on a {k3}, {k4}',
        keywords: [
          'minimalist studio desk lamp',
          'glowing warmly',
          'wooden desk',
          'soft product photo',
        ],
        attributes: ['warm bulb glow', 'brushed metal', 'slight top angle', 'calm mood'],
        sets: [s(2, 0, 4), s(2, 0, 4)],
        hue: 45,
      },
      {
        key: 'teo-2',
        title: 'Minimal clock',
        prompt:
          'A minimal wall clock with thin hands and no numerals on a matte white wall, soft product photo',
        topic: 'calm-workspace',
        subject: 'A {k1} with {k2} on a {k3}, {k4}',
        keywords: ['minimal wall clock', 'thin hands', 'matte white wall', 'soft product photo'],
        attributes: ['soft shadow', 'matte finish', 'straight-on view', 'quiet mood'],
        sets: [s(2, 0, 4)],
        hue: 220,
      },
      {
        key: 'teo-3',
        title: 'Precise grid',
        prompt: 'A precise black grid of thin lines on warm paper, flat graphic, square framing',
        topic: 'calm-workspace',
        subject: 'A {k1} of {k2} on {k3}, {k4}',
        keywords: ['precise black grid', 'thin lines', 'warm paper', 'flat graphic'],
        attributes: ['fine line weight', 'paper grain', 'square framing', 'exact mood'],
        sets: [s(2, 0, 4)],
        hue: 60,
      },
    ],
  },
  {
    kind: 'persona',
    order: 1,
    target: { A: 5, B: 0, C: 10, D: 5 },
    eventTotal: 60,
    reasonedRatio: 0.6,
    startDay: 5,
    projects: [
      {
        key: 'priya-1',
        title: 'Garden cafe',
        prompt:
          'A small garden cafe with round tables and string lights at dusk, warm and welcoming, photo',
        topic: 'reading-space',
        subject: 'A {k1} with {k2} and {k3}, {k4}',
        keywords: ['small garden cafe', 'round tables', 'string lights at dusk', 'warm photo'],
        attributes: ['golden dusk light', 'wrought iron', 'balanced framing', 'welcoming mood'],
        sets: [s(2, 1, 6), s(2, 1, 6)],
        hue: 100,
      },
      {
        key: 'priya-2',
        title: 'Paper boats',
        prompt:
          'A flotilla of paper boats floating on a calm pond at sunrise, soft pastel illustration',
        subject: 'A flotilla of {k1} floating on a {k2} at {k3}, {k4}',
        keywords: ['paper boats', 'calm pond', 'sunrise', 'pastel illustration'],
        attributes: ['soft pink sky', 'rippled water', 'low horizon', 'gentle mood'],
        sets: [s(2, 1, 6)],
        hue: 200,
      },
    ],
  },
  {
    kind: 'persona',
    order: 2,
    target: { A: 60, B: 45, C: -30, D: 60 },
    eventTotal: 70,
    reasonedRatio: 0.5,
    startDay: 6,
    projects: [
      {
        key: 'owen-1',
        title: 'Skate bowl',
        prompt:
          'A bold neon skate bowl at night with dramatic light trails, wide angle, vivid colors',
        subject: 'A bold {k1} at {k2} with {k3}, {k4}',
        keywords: ['neon skate bowl', 'night', 'dramatic light trails', 'vivid wide angle'],
        attributes: ['electric cyan glow', 'smooth concrete', 'dynamic tilt', 'thrilling mood'],
        sets: [s(3, 2, 8), s(3, 2, 8)],
        hue: 180,
      },
    ],
  },
  {
    kind: 'persona',
    order: 3,
    target: { A: -20, B: -30, C: 60, D: -50 },
    eventTotal: 60,
    reasonedRatio: 0.8,
    startDay: 7,
    projects: [
      {
        key: 'lena-1',
        title: 'Seed library',
        prompt:
          'A shelf of labeled seed jars arranged by season in a bright workshop, clean documentary photo',
        topic: 'eco-library',
        subject: 'A shelf of {k1} on a {k2} in a {k3}, {k4}',
        keywords: ['labeled seed jars', 'seasonal shelf', 'bright workshop', 'documentary photo'],
        attributes: ['clear daylight', 'glass and paper', 'frontal view', 'orderly mood'],
        sets: [s(1, 0, 2), s(2, 0, 2)],
        hue: 110,
      },
      {
        key: 'lena-2',
        title: 'Tidal chart',
        prompt:
          'A neatly drawn tidal chart with clear gridlines and coastal landmarks, flat illustration',
        topic: 'eco-library',
        subject: 'A neatly drawn {k1} with {k2} and {k3}, {k4}',
        keywords: ['tidal chart', 'clear gridlines', 'coastal landmarks', 'flat illustration'],
        attributes: ['muted blues', 'ink lines', 'top-down view', 'precise mood'],
        sets: [s(1, 0, 2)],
        hue: 230,
      },
    ],
  },
];

/** 시드 댓글(seed 작성자끼리). 프로젝트 키·작성자 seedOrder. */
export const SEED_COMMENTS: { project: string; authorOrder: number; body: string }[] = [
  { project: 'isla-1', authorOrder: 1, body: 'The neon edges really pop on the clean background.' },
  { project: 'dove-1', authorOrder: 3, body: 'Love the warm tones here, very inviting.' },
  { project: 'rhys-1', authorOrder: 5, body: 'The timber and greenery balance is lovely.' },
  { project: 'mara-1', authorOrder: 2, body: 'That rainy glow is striking.' },
  { project: 'teo-1', authorOrder: 4, body: 'Simple and calm, great product feel.' },
];

/** 프로젝트마다 다른 집계 초기값(결정적). index 는 CREATOR_SPECS 순서의 프로젝트 번호. */
export function initialStat(index: number, kind: 'seed' | 'persona') {
  const scale = kind === 'seed' ? 1 : 0.25;
  const pick = (base: number, mul: number, mod: number) =>
    Math.round((base + ((index * mul) % mod)) * scale);
  return {
    viewCount: pick(40, 37, 61),
    remixCount: pick(2, 7, 9),
    deriveCount: pick(1, 5, 6),
    likeCount: pick(5, 11, 41),
  };
}
