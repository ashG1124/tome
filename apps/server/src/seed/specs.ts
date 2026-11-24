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
  /** 상태. 기본 posted(완료·게시). finished = 완료만, building = 작업 중 */
  state?: ProjectState;
  /** 리믹스 상대(seed 창작자의 seedOrder) */
  remixPartner?: number;
  /** 파생 원작 프로젝트 키. 첫 세트의 첫 버전이 원작 대표 답변의 복사본이다 */
  derivedFrom?: string;
  /** 이 프로젝트 전용 이미지 파일이 없을 때 같이 쓰는 다른 프로젝트 키 */
  imageFrom?: string;
  /** 첫 세트의 대표 답변을 핀으로 고정 */
  pinned?: boolean;
}

export type ProjectState = 'posted' | 'finished' | 'building';

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
  /** 즐겨찾기한 seed 창작자(seedOrder) */
  favorites?: number[];
}

/** 창작자를 가리키는 값(seed 는 seedOrder, persona 는 1번부터). */
export type CreatorRef = Pick<CreatorSpec, 'kind' | 'order'>;

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

const BASE_CREATOR_SPECS: CreatorSpec[] = [
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

/** 쇼케이스 계정(전시 코드 하나가 들어가는 persona). 서가·리믹스·파생·아이덴티티가 미리 차 있다. */
export const SHOWCASE_PERSONA_ORDER = 4;

const baseProject = (key: string): ProjectSpec => {
  const found = BASE_CREATOR_SPECS.flatMap((c) => c.projects).find((p) => p.key === key);
  if (!found) throw new Error(`Unknown seed project ${key}`);
  return found;
};

/** 원작(seed 프로젝트)의 대표 답변을 복사해 시작한 파생 프로젝트. 제목·프롬프트·노드는 원작을 따른다. */
const deriveOf = (
  sourceKey: string,
  own: Pick<ProjectSpec, 'key' | 'sets'> & Partial<Pick<ProjectSpec, 'state' | 'topic' | 'pinned'>>,
): ProjectSpec => {
  const source = baseProject(sourceKey);
  return {
    title: source.title,
    prompt: source.prompt,
    ...(source.presetKey ? { presetKey: source.presetKey } : {}),
    subject: source.subject,
    keywords: source.keywords,
    attributes: source.attributes,
    hue: source.hue,
    ...own,
    derivedFrom: sourceKey,
  };
};

// 이미지: 쇼케이스 전용 생성 이미지가 아직 없어 imageFrom 으로 기존 시드 이미지를 같이 쓴다.
// 파생 프로젝트는 원작 이미지를 그대로 쓴다(실제 파생과 같다).
const SHOWCASE_SPEC: CreatorSpec = {
  kind: 'persona',
  order: SHOWCASE_PERSONA_ORDER,
  target: { A: -50, B: 40, C: 45, D: -45 },
  eventTotal: 150,
  reasonedRatio: 0.55,
  startDay: 8,
  favorites: [3, 4, 5],
  projects: [
    {
      key: 'julian-1',
      title: 'Task lamp study',
      prompt: 'A sculptural task lamp with a warm glow on an oak desk, soft product photo',
      topic: 'calm-workspace',
      subject: 'A {k1} with a {k2} on an {k3}, {k4}',
      keywords: ['sculptural task lamp', 'warm glow', 'oak desk', 'soft product photo'],
      attributes: ['warm bulb glow', 'brushed metal', 'slight top angle', 'calm mood'],
      sets: [s(2, 0, 2), s(1, 0, 2)],
      hue: 40,
      imageFrom: 'teo-1',
      pinned: true,
    },
    {
      key: 'julian-2',
      title: 'Modular shelf remix',
      prompt: 'A modular oak shelf with sliding panels in a bright studio, clean product photo',
      topic: 'eco-library',
      subject: 'A {k1} with {k2} in a {k3}, {k4}',
      keywords: ['modular oak shelf', 'sliding panels', 'bright studio', 'clean product photo'],
      attributes: ['even daylight', 'oak veneer', 'orthogonal framing', 'orderly mood'],
      sets: [s(2, 0, 2)],
      hue: 90,
      imageFrom: 'rhys-2',
      remixPartner: 3,
    },
    deriveOf('dove-1', {
      key: 'julian-3',
      sets: [s(3, 0, 2)],
      topic: 'reading-space',
      pinned: true,
    }),
    {
      key: 'julian-4',
      title: 'Quiet wall clock',
      prompt: 'A quiet wall clock with slim hands on a pale plaster wall, soft product photo',
      subject: 'A {k1} with {k2} on a {k3}, {k4}',
      keywords: ['quiet wall clock', 'slim hands', 'pale plaster wall', 'soft product photo'],
      attributes: ['soft shadow', 'matte finish', 'straight-on view', 'quiet mood'],
      sets: [s(2, 0, 2)],
      hue: 220,
      imageFrom: 'teo-2',
      state: 'finished',
    },
    {
      key: 'julian-5',
      title: 'Trail sneaker concept',
      prompt:
        'A lightweight trail sneaker with a bright neon sole, side view on a clean background',
      subject: 'A {k1} with a {k2}, {k3} on a {k4}',
      keywords: ['lightweight trail sneaker', 'bright neon sole', 'side view', 'clean background'],
      attributes: ['neon edge glow', 'glossy mesh', 'three-quarter tilt', 'futuristic mood'],
      sets: [s(1, 0, 2)],
      hue: 270,
      imageFrom: 'isla-1',
      remixPartner: 4,
      state: 'building',
    },
    deriveOf('rhys-3', { key: 'julian-6', sets: [s(2, 0, 2)], state: 'building' }),
    {
      key: 'julian-7',
      title: 'Chrome ribbon object',
      prompt: 'A polished chrome ribbon object on a dark plinth, dramatic rim light, studio photo',
      subject: 'A {k1} on a {k2}, {k3}, {k4}',
      keywords: [
        'polished chrome ribbon object',
        'dark plinth',
        'dramatic rim light',
        'studio photo',
      ],
      attributes: ['mirror reflections', 'polished metal', 'low camera angle', 'monumental calm'],
      sets: [s(1, 0, 2), s(2, 0, 2)],
      hue: 210,
      imageFrom: 'mara-3',
    },
    {
      key: 'julian-8',
      title: 'Linen table lamp',
      prompt:
        'A linen-shaded table lamp beside a soft armchair, warm evening tones, interior photo',
      topic: 'reading-space',
      subject: 'A {k1} beside a {k2}, {k3}, {k4}',
      keywords: [
        'linen-shaded table lamp',
        'soft armchair',
        'warm evening tones',
        'interior photo',
      ],
      attributes: ['amber glow', 'textured linen', 'close side view', 'quiet mood'],
      sets: [s(1, 0, 2)],
      hue: 35,
      imageFrom: 'dove-2',
      remixPartner: 5,
    },
  ],
};

export const CREATOR_SPECS: CreatorSpec[] = [...BASE_CREATOR_SPECS, SHOWCASE_SPEC];

/** 이 프로젝트 이미지로 쓰는 파일 키(project-images/<키>.jpg). 파생은 원작 이미지를 따른다. */
export function imageFileKeyOf(spec: ProjectSpec): string {
  if (spec.imageFrom) return spec.imageFrom;
  if (spec.derivedFrom) return imageFileKeyOf(baseProject(spec.derivedFrom));
  return spec.key;
}

/** 전용 이미지를 생성해야 하는 프로젝트인가(다른 이미지를 같이 쓰지 않는 것). */
export const needsOwnImage = (spec: ProjectSpec): boolean => imageFileKeyOf(spec) === spec.key;

const seed = (order: number): CreatorRef => ({ kind: 'seed', order });
const showcase: CreatorRef = { kind: 'persona', order: SHOWCASE_PERSONA_ORDER };

/** 시드 댓글. 앞 5개는 seed 작성자끼리, 뒤는 쇼케이스 계정이 주고받은 것. 순서가 id 이므로 뒤에만 더한다. */
export const SEED_COMMENTS: { project: string; author: CreatorRef; body: string }[] = [
  {
    project: 'isla-1',
    author: seed(1),
    body: 'The neon edges really pop on the clean background.',
  },
  { project: 'dove-1', author: seed(3), body: 'Love the warm tones here, very inviting.' },
  { project: 'rhys-1', author: seed(5), body: 'The timber and greenery balance is lovely.' },
  { project: 'mara-1', author: seed(2), body: 'That rainy glow is striking.' },
  { project: 'teo-1', author: seed(4), body: 'Simple and calm, great product feel.' },
  {
    project: 'rhys-2',
    author: showcase,
    body: 'The sliding panels gave me the idea for my shelf.',
  },
  { project: 'julian-1', author: seed(5), body: 'Lovely warm glow, very calm.' },
  { project: 'julian-3', author: seed(2), body: 'Nice take on my sofa, the light feels softer.' },
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
