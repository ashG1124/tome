// 시드 콘텐츠 정의(이름·프롬프트·토픽 제목·목표 프로필).
// 이미지: 시안(Figma) 이미지는 디자인 자산이라 공개 저장소에 두지 않고 자산 폴더(seed/projects/<figma>.jpg)에서 읽는다.
// 그 폴더가 없으면 저장소의 prisma/seed/project-images(#112, db:seed:generate 로 만든 AI 이미지)로 대신한다.
// 프로젝트 key 는 고정 id 의 씨앗이라 바꾸지 않는다(이름이 바뀐 창작자의 예전 key 를 그대로 쓴다).
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

/** 토픽 key 는 토픽 id 의 씨앗이라 바꾸지 않는다. 제목은 시안 핫토픽을 따른다. */
export type TopicKey =
  'urban-shoes' | 'reading-space' | 'eco-library' | 'calm-workspace' | 'mv-concept';

/** 아고라 집계 초기값을 직접 정할 때(추천 순서를 시안과 맞춘다). */
export interface StatOverride {
  viewCount: number;
  remixCount: number;
  deriveCount: number;
  likeCount: number;
}

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
  /** 자산 폴더의 시안 이미지 이름(seed/projects/<figma>.jpg) */
  figma?: string;
  /** 상태. 기본 posted(완료·게시). finished = 완료만, building = 작업 중 */
  state?: ProjectState;
  /** 리믹스 상대(seed 창작자의 seedOrder, 또는 쇼케이스 계정 'showcase') */
  remixPartner?: number | 'showcase';
  /** 파생 원작 프로젝트 키(seed 또는 쇼케이스 프로젝트). 첫 세트의 첫 버전이 원작 대표 답변의 복사본이다 */
  derivedFrom?: string;
  /** 저장소 이미지(project-images/<key>.jpg)가 없을 때 대신 쓰는 다른 프로젝트 키 */
  imageFrom?: string;
  /** 첫 세트의 대표 답변을 핀으로 고정 */
  pinned?: boolean;
  /** 집계 초기값(없으면 initialStat) */
  stat?: StatOverride;
}

export type ProjectState = 'posted' | 'finished' | 'building';

export interface CreatorSpec {
  kind: 'seed' | 'persona';
  /** seed 는 seedOrder, persona 는 1번부터 */
  order: number;
  target: ProfileTarget;
  /** 이벤트 개수 목표. 구조 이벤트가 많으면 생성기가 더 늘린다 */
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

/** 시안 핫토픽 순서. seedOrder = 배열 순서 + 1. */
export const TOPICS: { key: TopicKey; title: string }[] = [
  { key: 'eco-library', title: 'Sculptural architecture' },
  { key: 'urban-shoes', title: 'Urban Trail' },
  { key: 'reading-space', title: 'Warm Task Lighting' },
  { key: 'calm-workspace', title: 'Development of modern park' },
  { key: 'mv-concept', title: 'MV Concept Shots' },
];

const s = (versions: number, discarded: number, keys: number): SetSpec => ({
  versions,
  discarded,
  keys,
});

/** 시안 추천(Recommended) 순서를 집계로 맞춘다. 1위가 가장 크다. */
const recommended = (rank: number): StatOverride => ({
  viewCount: 400 - rank * 20,
  remixCount: 12 - rank,
  deriveCount: 8 - Math.floor(rank / 2),
  likeCount: 120 - rank * 6,
});

const BASE_CREATOR_SPECS: CreatorSpec[] = [
  {
    // Lind
    kind: 'seed',
    order: 1,
    target: { A: 70, B: 60, C: 40, D: 30 },
    eventTotal: 120,
    reasonedRatio: 0.8,
    startDay: 0,
    projects: [
      {
        key: 'mara-1',
        title: 'Bridge light MV',
        prompt:
          'A neon-lit music video scene of a singer walking through rainy Seoul streets at night, cinematic wide shot',
        presetKey: 'music-video',
        topic: 'mv-concept',
        subject: 'A {k1} of a {k2} walking through {k3}, {k4}, cinematic wide shot',
        keywords: [
          'neon-lit music video scene',
          'singer',
          'rainy Seoul streets at night',
          'glowing reflections',
        ],
        attributes: ['backlit glow', 'night river sheen', 'wide cinematic framing', 'soft haze'],
        sets: [s(3, 1, 7), s(2, 1, 7)],
        figma: 'mv-bridge-silhouette',
      },
      {
        key: 'mara-2',
        title: 'Street mirror MV',
        prompt:
          'A round convex street mirror reflecting a quiet town lane, music video still, warm film tones',
        topic: 'mv-concept',
        subject: 'A {k1} reflecting a {k2}, {k3}, {k4}',
        keywords: [
          'round convex street mirror',
          'quiet town lane',
          'music video still',
          'warm film tones',
        ],
        attributes: ['red mirror rim', 'curved reflection', 'close framing', 'nostalgic mood'],
        sets: [s(3, 1, 7), s(2, 1, 7)],
        figma: 'mv-street-mirror',
        // 쇼케이스 계정(Julian)을 리믹스 상대로 골랐다(프로필 Remixed by).
        remixPartner: 'showcase',
      },
      {
        key: 'mara-3',
        title: 'Crowd jump MV',
        prompt: 'A crowd jumping under red stage lights with motion blur, music video concept shot',
        topic: 'mv-concept',
        subject: 'A {k1} under {k2} with {k3}, {k4}',
        keywords: ['crowd jumping', 'red stage lights', 'motion blur', 'music video concept shot'],
        attributes: ['red light streaks', 'grainy film', 'low angle', 'wild energy'],
        sets: [s(3, 1, 7), s(2, 1, 7)],
        figma: 'mv-crowd-jump',
      },
      {
        key: 'mara-4',
        title: 'Cyber-cympathy',
        prompt:
          'A sleek mixed reality headset with a smoky visor floating on a soft grey background, product render',
        subject: 'A {k1} with a {k2} floating on a {k3}, {k4}',
        keywords: [
          'sleek mixed reality headset',
          'smoky visor',
          'soft grey background',
          'product render',
        ],
        attributes: [
          'soft studio light',
          'matte graphite shell',
          'three-quarter view',
          'calm future mood',
        ],
        sets: [s(3, 1, 7), s(2, 1, 7)],
        figma: 'rec-cyber-cympathy',
        imageFrom: 'mara-3',
        stat: recommended(1),
      },
      {
        key: 'mara-5',
        title: 'Nomad workspace',
        prompt:
          'A compact autonomous pod vehicle parked between glass towers on a city street, morning light',
        subject: 'A {k1} parked between {k2} on a {k3}, {k4}',
        keywords: [
          'compact autonomous pod vehicle',
          'glass towers',
          'city street',
          'morning light',
        ],
        attributes: ['warm wood trim', 'rounded body', 'street-level view', 'quiet commute mood'],
        sets: [s(3, 1, 7), s(2, 1, 7)],
        figma: 'rec-nomad-workspace',
        imageFrom: 'mara-1',
        stat: recommended(3),
      },
    ],
  },
  {
    // Ceredic
    kind: 'seed',
    order: 2,
    target: { A: -55, B: -65, C: 20, D: -40 },
    eventTotal: 80,
    reasonedRatio: 0.5,
    startDay: 1,
    projects: [
      {
        key: 'dove-1',
        title: 'Copper pendant',
        prompt:
          'A copper dome pendant lamp glowing over a dark sage wall, warm task lighting, product photo',
        topic: 'reading-space',
        subject: 'A {k1} glowing over a {k2}, {k3}, {k4}',
        keywords: [
          'copper dome pendant lamp',
          'dark sage wall',
          'warm task lighting',
          'product photo',
        ],
        attributes: ['amber downlight', 'brushed copper', 'centered framing', 'quiet mood'],
        sets: [s(2, 0, 2), s(2, 0, 2)],
        figma: 'lamp-copper-pendant',
      },
      {
        key: 'dove-2',
        title: 'Teal pendant',
        prompt:
          'A white enamel pendant lamp hanging against a deep teal wall, calm task lighting, product photo',
        topic: 'reading-space',
        subject: 'A {k1} hanging against a {k2}, {k3}, {k4}',
        keywords: [
          'white enamel pendant lamp',
          'deep teal wall',
          'calm task lighting',
          'product photo',
        ],
        attributes: ['soft cone of light', 'glossy enamel', 'low angle', 'calm mood'],
        sets: [s(2, 0, 2), s(1, 0, 2)],
        figma: 'lamp-teal-pendant',
      },
      {
        key: 'dove-3',
        title: 'Sculpted table lamp',
        prompt:
          'A white cone-shaded table lamp on a walnut sideboard, warm evening light, interior photo',
        topic: 'reading-space',
        subject: 'A {k1} on a {k2}, {k3}, {k4}',
        keywords: [
          'white cone-shaded table lamp',
          'walnut sideboard',
          'warm evening light',
          'interior photo',
        ],
        attributes: ['soft wall glow', 'dark walnut grain', 'side view', 'cozy mood'],
        sets: [s(2, 0, 2), s(1, 0, 2)],
        figma: 'lamp-table-white',
      },
      {
        key: 'dove-4',
        title: 'Lifestyle furniture',
        prompt:
          'A light oak open shelf with books and ceramics on a pale grey background, product photo',
        subject: 'A {k1} with {k2} on a {k3}, {k4}',
        keywords: [
          'light oak open shelf',
          'books and ceramics',
          'pale grey background',
          'product photo',
        ],
        attributes: ['even daylight', 'oak grain', 'straight-on view', 'orderly mood'],
        sets: [s(2, 0, 2), s(1, 0, 2)],
        figma: 'rec-lifestyle-furniture',
        imageFrom: 'dove-3',
        stat: recommended(2),
      },
      {
        key: 'dove-5',
        title: 'Kinetic craft',
        prompt:
          'An expressive painting of an orange marsh with white reeds and a lone deer, textured brush strokes',
        subject: 'An expressive painting of an {k1} with {k2} and a {k3}, {k4}',
        keywords: ['orange marsh', 'white reeds', 'lone deer', 'textured brush strokes'],
        attributes: ['burnt orange palette', 'thick impasto', 'wide horizon', 'wistful mood'],
        sets: [s(2, 0, 2), s(1, 0, 2)],
        figma: 'rec-kinetic-craft',
        imageFrom: 'dove-2',
        stat: recommended(8),
      },
    ],
  },
  {
    // Nichole
    kind: 'seed',
    order: 3,
    target: { A: 10, B: 20, C: 75, D: -55 },
    eventTotal: 100,
    reasonedRatio: 0.9,
    startDay: 2,
    projects: [
      {
        key: 'rhys-1',
        title: 'Black lattice curve',
        prompt:
          'A black lattice facade curving into an open oval against a white sky, sculptural architecture photo',
        topic: 'eco-library',
        subject: 'A {k1} curving into an {k2} against a {k3}, {k4}',
        keywords: [
          'black lattice facade',
          'open oval',
          'white sky',
          'sculptural architecture photo',
        ],
        attributes: ['high contrast', 'steel lattice', 'upward view', 'bold mood'],
        sets: [s(1, 0, 2), s(2, 0, 2)],
        figma: 'sculpt-black-curve',
      },
      {
        key: 'rhys-2',
        title: 'Bronze ribbon facade',
        prompt:
          'A bronze ribbon facade wrapping in tight layered curves, sculptural architecture detail',
        topic: 'eco-library',
        subject: 'A {k1} wrapping in {k2}, {k3} {k4}',
        keywords: [
          'bronze ribbon facade',
          'tight layered curves',
          'sculptural architecture',
          'detail',
        ],
        attributes: ['warm metallic sheen', 'woven bands', 'diagonal framing', 'dynamic mood'],
        sets: [s(1, 0, 2), s(1, 0, 2)],
        figma: 'sculpt-bronze-ribbon',
      },
      {
        key: 'rhys-3',
        title: 'Teal wave facade',
        prompt:
          'A silver woven facade rippling like a wave under a teal sky, architecture detail photo',
        topic: 'eco-library',
        subject: 'A {k1} rippling like a {k2} under a {k3}, {k4}',
        keywords: ['silver woven facade', 'wave', 'teal sky', 'architecture detail photo'],
        attributes: ['clean daylight', 'woven aluminium', 'low angle', 'serene mood'],
        sets: [s(1, 0, 2), s(1, 0, 2)],
        figma: 'sculpt-teal-wave',
        // 쇼케이스 계정(Julian)을 리믹스 상대로 골랐다(프로필 Remixed by).
        remixPartner: 'showcase',
      },
      {
        key: 'rhys-4',
        title: 'Hydroponic cell',
        prompt:
          'A white french-door refrigerator open to show hydroponic greens inside, clean product photo',
        subject: 'A {k1} open to show {k2} inside, {k3}, {k4}',
        keywords: [
          'white french-door refrigerator',
          'hydroponic greens',
          'clean studio',
          'product photo',
        ],
        attributes: ['cool even light', 'brushed handles', 'front view', 'fresh mood'],
        sets: [s(1, 0, 2), s(2, 0, 2)],
        figma: 'rec-hydroponic-cell',
        imageFrom: 'rhys-2',
        stat: recommended(4),
      },
      {
        key: 'rhys-5',
        title: 'Graphic identity / type',
        prompt:
          'A bold cobalt blue abstract letter mark on a warm cream background, graphic identity',
        subject: 'A {k1} {k2} on a {k3}, {k4}',
        keywords: [
          'bold cobalt blue',
          'abstract letter mark',
          'warm cream background',
          'graphic identity',
        ],
        attributes: ['flat color', 'rounded strokes', 'centered mark', 'playful mood'],
        sets: [s(1, 0, 2), s(1, 0, 2)],
        figma: 'rec-graphic-identity',
        imageFrom: 'rhys-3',
        stat: recommended(7),
      },
    ],
  },
  {
    // Judy
    kind: 'seed',
    order: 4,
    target: { A: 40, B: 10, C: -55, D: 75 },
    eventTotal: 140,
    reasonedRatio: 0.4,
    startDay: 3,
    projects: [
      {
        key: 'isla-1',
        title: 'Trail runner',
        prompt:
          'A pair of sneakers redesigned in a cyberpunk neon style, side view on a clean background',
        presetKey: 'sneaker',
        topic: 'urban-shoes',
        subject: 'A pair of {k1} redesigned in a {k2}, {k3} on a {k4}',
        keywords: ['sneakers', 'cyberpunk neon style', 'side view', 'clean background'],
        attributes: ['orange accents', 'rugged mesh', 'three-quarter tilt', 'outdoor mood'],
        sets: [s(3, 2, 10), s(3, 2, 10)],
        figma: 'trail-hiker',
      },
      {
        key: 'isla-2',
        title: 'Chunky trail sneaker',
        prompt:
          'A chunky grey trail sneaker with a sculpted white sole floating on a light background',
        topic: 'urban-shoes',
        subject: 'A {k1} with a {k2} floating on a {k3}, {k4}',
        keywords: [
          'chunky grey trail sneaker',
          'sculpted white sole',
          'light background',
          'product photo',
        ],
        attributes: ['mint laces', 'layered foam', 'side view', 'sporty mood'],
        sets: [s(3, 2, 10), s(3, 2, 10)],
        figma: 'trail-chunky',
      },
      {
        key: 'isla-3',
        title: 'High-top trail boot',
        prompt: 'A white knit high-top sneaker with navy trim floating in a bright studio',
        topic: 'urban-shoes',
        subject: 'A {k1} with {k2} floating in a {k3}, {k4}',
        keywords: ['white knit high-top sneaker', 'navy trim', 'bright studio', 'product shot'],
        attributes: ['crisp shadow', 'knit texture', 'side view', 'clean mood'],
        sets: [s(3, 2, 10)],
        figma: 'trail-hightop',
        // 쇼케이스 계정(Julian)을 리믹스 상대로 골랐다(프로필 Remixed by).
        remixPartner: 'showcase',
      },
      {
        key: 'isla-4',
        title: 'Cozy-Tea set',
        prompt:
          'A cast iron teapot and two cups of golden tea on a bamboo tray, top-down still life',
        subject: 'A {k1} and {k2} on a {k3}, {k4}',
        keywords: [
          'cast iron teapot',
          'two cups of golden tea',
          'bamboo tray',
          'top-down still life',
        ],
        attributes: ['soft daylight', 'dark iron', 'overhead view', 'slow mood'],
        sets: [s(3, 2, 10)],
        figma: 'rec-cozy-tea-set',
        imageFrom: 'isla-2',
        stat: recommended(9),
      },
      {
        key: 'isla-5',
        title: 'Mythical kitchen',
        prompt:
          'A sculpted stone kitchen island in a grand grey room with ornate moulding, interior render',
        subject: 'A {k1} in a {k2} with {k3}, {k4}',
        keywords: [
          'sculpted stone kitchen island',
          'grand grey room',
          'ornate moulding',
          'interior render',
        ],
        attributes: ['soft shadows', 'raw stone', 'frontal view', 'mythic mood'],
        sets: [s(3, 2, 10)],
        figma: 'rec-mythical-kitchen',
        imageFrom: 'isla-3',
        stat: recommended(10),
      },
    ],
  },
  {
    // Jay
    kind: 'seed',
    order: 5,
    target: { A: -30, B: -10, C: -30, D: -20 },
    eventTotal: 70,
    reasonedRatio: 0.7,
    startDay: 4,
    projects: [
      {
        key: 'teo-1',
        title: 'Warm task lamp',
        prompt: 'A minimalist studio desk lamp glowing warmly on a wooden desk, soft product photo',
        presetKey: 'desk-lamp',
        topic: 'reading-space',
        subject: 'A {k1} {k2} on a {k3}, {k4}',
        keywords: [
          'minimalist studio desk lamp',
          'glowing warmly',
          'wooden desk',
          'soft product photo',
        ],
        attributes: ['warm bulb glow', 'ochre enamel', 'slight top angle', 'calm mood'],
        sets: [s(2, 0, 4), s(2, 0, 4)],
        figma: 'lamp-orange-desk',
      },
      {
        key: 'teo-2',
        title: 'Open lawn park',
        prompt:
          'A wide open park lawn with scattered trees under a bright cloudy sky, landscape photo',
        topic: 'calm-workspace',
        subject: 'A {k1} with {k2} under a {k3}, {k4}',
        keywords: [
          'wide open park lawn',
          'scattered trees',
          'bright cloudy sky',
          'landscape photo',
        ],
        attributes: ['fresh green', 'soft clouds', 'eye-level view', 'open mood'],
        sets: [s(2, 0, 4)],
        figma: 'park-open-lawn',
      },
      {
        key: 'teo-3',
        title: 'Park path',
        prompt:
          'A winding gravel path through a green park lawn lined with trees, summer afternoon',
        topic: 'calm-workspace',
        subject: 'A {k1} through a {k2} lined with {k3}, {k4}',
        keywords: ['winding gravel path', 'green park lawn', 'trees', 'summer afternoon'],
        attributes: ['warm sunlight', 'soft grass', 'leading line', 'relaxed mood'],
        sets: [s(2, 0, 4)],
        figma: 'park-path',
      },
      {
        key: 'teo-4',
        title: 'Sound armor',
        prompt: 'A soft fabric-wrapped smart speaker on a light wooden base, minimal product photo',
        subject: 'A {k1} on a {k2}, {k3} {k4}',
        keywords: [
          'soft fabric-wrapped smart speaker',
          'light wooden base',
          'minimal',
          'product photo',
        ],
        attributes: ['diffused light', 'woven fabric', 'front view', 'quiet mood'],
        sets: [s(2, 0, 4)],
        figma: 'rec-sound-armor',
        imageFrom: 'teo-2',
        stat: recommended(5),
      },
      {
        key: 'teo-5',
        title: 'Concept car sketch',
        prompt: 'A silver wedge-shaped concept car speeding across a salt flat under a blue sky',
        subject: 'A {k1} speeding across a {k2} under a {k3}, {k4}',
        keywords: ['silver wedge-shaped concept car', 'salt flat', 'blue sky', 'motion shot'],
        attributes: ['hard sunlight', 'brushed metal', 'low side angle', 'fast mood'],
        sets: [s(2, 0, 4)],
        figma: 'rec-concept-car',
        imageFrom: 'teo-3',
        stat: recommended(6),
      },
    ],
  },
  {
    // Erick
    kind: 'persona',
    order: 1,
    target: { A: 5, B: 0, C: 10, D: 5 },
    eventTotal: 60,
    reasonedRatio: 0.6,
    startDay: 5,
    projects: [
      {
        key: 'priya-1',
        title: 'Trail sandal',
        prompt:
          'A chunky pink and cream trail sandal with buckled straps floating on a white background',
        topic: 'urban-shoes',
        subject: 'A {k1} with {k2} floating on a {k3}, {k4}',
        keywords: [
          'chunky pink and cream trail sandal',
          'buckled straps',
          'white background',
          'product photo',
        ],
        attributes: ['soft shadow', 'molded foam', 'three-quarter view', 'playful mood'],
        sets: [s(2, 1, 6), s(2, 1, 6)],
        figma: 'trail-sandal',
      },
      {
        key: 'priya-2',
        title: 'White balcony curves',
        prompt:
          'White curved balconies stacked on a tiled facade against a pale sky, sculptural architecture',
        topic: 'eco-library',
        subject: '{k1} stacked on a {k2} against a {k3}, {k4}',
        keywords: ['White curved balconies', 'tiled facade', 'pale sky', 'sculptural architecture'],
        attributes: ['soft daylight', 'white tile', 'upward view', 'calm mood'],
        sets: [s(2, 1, 6)],
        figma: 'sculpt-white-balcony',
        // 쇼케이스 계정(Julian)을 리믹스 상대로 골랐다(프로필 Remixed by).
        remixPartner: 'showcase',
      },
    ],
  },
  {
    // Hayden
    kind: 'persona',
    order: 2,
    target: { A: 60, B: 45, C: -30, D: 60 },
    eventTotal: 70,
    reasonedRatio: 0.5,
    startDay: 6,
    projects: [
      {
        key: 'owen-1',
        title: 'City fence night drive',
        prompt:
          'A night city skyline seen through a chain-link fence with streaking car lights, music video shot',
        topic: 'mv-concept',
        subject: 'A {k1} seen through a {k2} with {k3}, {k4}',
        keywords: [
          'night city skyline',
          'chain-link fence',
          'streaking car lights',
          'music video shot',
        ],
        attributes: ['neon green glow', 'wire mesh', 'tilted framing', 'restless mood'],
        sets: [s(3, 2, 8), s(3, 2, 8)],
        figma: 'mv-city-fence',
        // 쇼케이스 계정(Julian)을 리믹스 상대로 골랐다(프로필 Remixed by).
        remixPartner: 'showcase',
      },
    ],
  },
  {
    // Nick
    kind: 'persona',
    order: 3,
    target: { A: -20, B: -30, C: 60, D: -50 },
    eventTotal: 60,
    reasonedRatio: 0.8,
    startDay: 7,
    projects: [
      {
        key: 'lena-1',
        title: 'Park at the city edge',
        prompt:
          'A green park lawn with a row of trees and new towers behind, clear blue sky, landscape photo',
        topic: 'calm-workspace',
        subject: 'A {k1} with a {k2} and {k3} behind, {k4}',
        keywords: ['green park lawn', 'row of trees', 'new towers', 'clear blue sky'],
        attributes: ['bright daylight', 'trimmed grass', 'wide view', 'hopeful mood'],
        sets: [s(1, 0, 2), s(2, 0, 2)],
        figma: 'park-city-edge',
      },
      {
        key: 'lena-2',
        title: 'Picnic lawn',
        prompt:
          'People relaxing on a sunny park lawn under large old trees, documentary landscape photo',
        topic: 'calm-workspace',
        subject: '{k1} relaxing on a {k2} under {k3}, {k4}',
        keywords: ['People', 'sunny park lawn', 'large old trees', 'documentary landscape photo'],
        attributes: ['dappled light', 'soft grass', 'eye-level view', 'easy mood'],
        sets: [s(1, 0, 2)],
        figma: 'park-picnic',
        // 쇼케이스 계정(Julian)을 리믹스 상대로 골랐다(프로필 Remixed by).
        remixPartner: 'showcase',
      },
    ],
  },
];

/** 쇼케이스 계정(전시 코드 하나가 들어가는 persona). 서가·리믹스·파생·아이덴티티가 미리 차 있다. */
export const SHOWCASE_PERSONA_ORDER = 4;

/** seed 프로젝트(없으면 쇼케이스 프로젝트)를 key 로 찾는다. */
const baseProject = (key: string): ProjectSpec => {
  const found =
    BASE_CREATOR_SPECS.flatMap((c) => c.projects).find((p) => p.key === key) ??
    SHOWCASE_SPEC.projects.find((p) => p.key === key);
  if (!found) throw new Error(`Unknown seed project ${key}`);
  return found;
};

/** 원작의 대표 답변을 복사해 시작한 파생 프로젝트. 프롬프트·노드·이미지는 원작을 따르고, 제목은 따로 줄 수 있다. */
const deriveOf = (
  sourceKey: string,
  own: Pick<ProjectSpec, 'key' | 'sets'> &
    Partial<Pick<ProjectSpec, 'state' | 'topic' | 'pinned' | 'title'>>,
): ProjectSpec => {
  const source = baseProject(sourceKey);
  return {
    title: source.title,
    prompt: source.prompt,
    ...(source.presetKey ? { presetKey: source.presetKey } : {}),
    subject: source.subject,
    keywords: source.keywords,
    attributes: source.attributes,
    ...own,
    derivedFrom: sourceKey,
  };
};

/** 쇼케이스 작업 하나(시안 홈 서가의 타일). 저장소 대체 이미지는 imageFrom. */
const work = (
  n: number,
  figma: string,
  imageFrom: string,
  title: string,
  prompt: string,
  subject: string,
  keywords: ProjectSpec['keywords'],
  attributes: ProjectSpec['attributes'],
  extra: Partial<ProjectSpec> = {},
): ProjectSpec => ({
  key: `julian-${n}`,
  title,
  prompt,
  subject,
  keywords,
  attributes,
  // 버전 여러 장은 대표작(1·2·4·5)에 모으고 나머지는 한 장씩 둔다(아이덴티티 방향성 D 목표를 지킨다).
  sets: n % 3 === 0 ? [s(1, 0, 2), s(1, 0, 2)] : [s(1, 0, 2)],
  figma,
  imageFrom,
  ...extra,
});

const SHOWCASE_SPEC: CreatorSpec = {
  kind: 'persona',
  order: SHOWCASE_PERSONA_ORDER,
  target: { A: -50, B: 40, C: 45, D: -45 },
  eventTotal: 150,
  reasonedRatio: 0.55,
  startDay: 8,
  favorites: [4, 1, 3],
  projects: [
    work(
      1,
      'home-cloud-armchair',
      'dove-1',
      'Cloud lounge chair',
      'A rounded cream boucle lounge chair on a warm beige background, soft product photo',
      'A {k1} on a {k2}, {k3}, {k4}',
      ['rounded cream boucle lounge chair', 'warm beige background', 'soft light', 'product photo'],
      ['soft shadow', 'boucle texture', 'three-quarter view', 'cozy mood'],
      // 시안 작업장처럼 버전이 여러 장 쌓인 대표작(Answer 06, 마지막 버전 핀).
      { pinned: true, sets: [s(6, 0, 2)] },
    ),
    work(
      2,
      'home-red-shelf',
      'rhys-2',
      'Red steel shelf',
      'A glossy red steel shelf with thin planes against a blush wall, studio product photo',
      'A {k1} with {k2} against a {k3}, {k4}',
      ['glossy red steel shelf', 'thin planes', 'blush wall', 'studio product photo'],
      ['hard shadow', 'lacquered steel', 'close crop', 'bold mood'],
      { remixPartner: 2, sets: [s(3, 0, 2), s(1, 0, 2)] },
    ),
    work(
      3,
      'home-retro-computer',
      'teo-2',
      'Retro desktop computer',
      'A beige retro desktop computer with a small screen on a white table, soft studio light',
      'A {k1} with a {k2} on a {k3}, {k4}',
      ['beige retro desktop computer', 'small screen', 'white table', 'soft studio light'],
      ['gentle shadow', 'matte plastic', 'front view', 'nostalgic mood'],
      { state: 'building' },
    ),
    work(
      4,
      'home-glazed-vases',
      'mara-3',
      'Glazed vase pair',
      'A pair of tall glazed vases in ruby and cobalt on white plinths, gallery still life',
      'A {k1} in {k2} on {k3}, {k4}',
      ['pair of tall glazed vases', 'ruby and cobalt', 'white plinths', 'gallery still life'],
      ['glossy highlights', 'reactive glaze', 'eye-level view', 'quiet mood'],
      { sets: [s(5, 0, 2)] },
    ),
    work(
      5,
      'home-blue-pendant',
      'dove-2',
      'Powder blue pendant',
      'A powder blue pendant lamp with a walnut cap glowing softly, close product photo',
      'A {k1} with a {k2} {k3}, {k4}',
      ['powder blue pendant lamp', 'walnut cap', 'glowing softly', 'close product photo'],
      ['warm bulb glow', 'satin metal', 'low angle', 'calm mood'],
      { remixPartner: 4, sets: [s(6, 0, 2)] },
    ),
    work(
      6,
      'home-coral-runner',
      'isla-1',
      'Coral runner',
      'A white running sneaker with a coral sole floating on a pale grey background',
      'A {k1} with a {k2} floating on a {k3}, {k4}',
      ['white running sneaker', 'coral sole', 'pale grey background', 'product photo'],
      ['soft shadow', 'mesh upper', 'side view', 'light mood'],
    ),
    work(
      7,
      'home-wall-clock',
      'teo-2',
      'Quiet wall clock',
      'A pale grey wall clock with a red second hand on a soft grey wall, product photo',
      'A {k1} with a {k2} on a {k3}, {k4}',
      ['pale grey wall clock', 'red second hand', 'soft grey wall', 'product photo'],
      ['soft shadow', 'matte finish', 'slight angle', 'quiet mood'],
      { remixPartner: 5 },
    ),
    work(
      8,
      'home-glass-coffee-table',
      'rhys-3',
      'Glass coffee table',
      'A square smoked glass coffee table on chrome legs in a bright studio, product photo',
      'A {k1} on {k2} in a {k3}, {k4}',
      ['square smoked glass coffee table', 'chrome legs', 'bright studio', 'product photo'],
      ['clear reflections', 'polished chrome', 'high angle', 'clean mood'],
    ),
    work(
      9,
      'home-floating-table',
      'rhys-1',
      'Floating glass table',
      'A round glass side table on a black marble base in a white room, product photo',
      'A {k1} on a {k2} in a {k3}, {k4}',
      ['round glass side table', 'black marble base', 'white room', 'product photo'],
      ['soft daylight', 'veined marble', 'low angle', 'airy mood'],
    ),
    work(
      10,
      'home-magnifier',
      'lena-2',
      'Desk magnifier',
      'A chrome arm desk magnifier with a round lens on a white background, close product photo',
      'A {k1} with a {k2} on a {k3}, {k4}',
      ['chrome arm desk magnifier', 'round lens', 'white background', 'close product photo'],
      ['bright highlights', 'polished chrome', 'diagonal framing', 'precise mood'],
      { state: 'finished' },
    ),
    deriveOf('teo-1', { key: 'julian-11', sets: [s(2, 0, 2)], pinned: true }),
    work(
      12,
      'home-swivel-armchair',
      'dove-3',
      'Soft swivel armchair',
      'A soft grey swivel armchair with a round cushion on a white background, product photo',
      'A {k1} with a {k2} on a {k3}, {k4}',
      ['soft grey swivel armchair', 'round cushion', 'white background', 'product photo'],
      ['soft shadow', 'woven fabric', 'three-quarter view', 'relaxed mood'],
    ),
    work(
      13,
      'home-wall-lamp',
      'teo-1',
      'Wall arm lamp',
      'A white wall arm lamp with a round shade against a white tiled wall, interior detail',
      'A {k1} with a {k2} against a {k3}, {k4}',
      ['white wall arm lamp', 'round shade', 'white tiled wall', 'interior detail'],
      ['soft daylight', 'enamel shade', 'side view', 'clean mood'],
    ),
    work(
      14,
      'home-bentwood-chair',
      'dove-1',
      'Bentwood chair',
      'A honey bentwood dining chair with a round seat on a light background, product photo',
      'A {k1} with a {k2} on a {k3}, {k4}',
      ['honey bentwood dining chair', 'round seat', 'light background', 'product photo'],
      ['warm light', 'smooth beech', 'front view', 'friendly mood'],
    ),
    work(
      15,
      'home-olive-glasses',
      'lena-1',
      'Olive frame glasses',
      'Olive green acetate glasses resting on a white surface, close macro product photo',
      '{k1} resting on a {k2}, {k3} {k4}',
      ['Olive green acetate glasses', 'white surface', 'close macro', 'product photo'],
      ['soft reflections', 'translucent acetate', 'low angle', 'calm mood'],
    ),
    work(
      16,
      'home-record-player',
      'mara-2',
      'Wall record player',
      'A white wall-mounted record player with an orange tag on a pale blue background, product photo',
      'A {k1} with an {k2} on a {k3}, {k4}',
      ['white wall-mounted record player', 'orange tag', 'pale blue background', 'product photo'],
      ['crisp light', 'matte plastic', 'tilted view', 'playful mood'],
    ),
    work(
      17,
      'home-spotlight',
      'owen-1',
      'Folded spotlight',
      'A folded black metal spotlight lamp with a glowing round face, studio product photo',
      'A {k1} with a {k2}, {k3} {k4}',
      ['folded black metal spotlight lamp', 'glowing round face', 'studio', 'product photo'],
      ['warm glow', 'black sheet metal', 'front view', 'dramatic mood'],
      { state: 'building' },
    ),
    work(
      18,
      'home-office-chairs',
      'priya-1',
      'Sage office chairs',
      'Two sage green office chairs on rolling bases casting long shadows, overhead product photo',
      '{k1} on {k2} casting {k3}, {k4}',
      ['Two sage green office chairs', 'rolling bases', 'long shadows', 'overhead product photo'],
      ['hard sunlight', 'molded plastic', 'top-down view', 'sunny mood'],
    ),
    deriveOf('dove-4', { key: 'julian-19', sets: [s(2, 0, 2)], state: 'building' }),
    deriveOf('mara-4', { key: 'julian-20', sets: [s(1, 0, 2)], state: 'finished' }),
  ],
};

/**
 * 다른 persona 가 쇼케이스 계정의 게시작에서 파생해 간 작업(프로필 Derived by, 아고라 Derivative 목록).
 * persona 서가 맨 뒤에 붙는다. persona 리셋이 원작과 함께 지우고 다시 넣는다.
 */
const SHOWCASE_DERIVES: Record<number, ProjectSpec[]> = {
  // Erick
  1: [
    deriveOf('julian-6', {
      key: 'erick-d1',
      title: 'Coral trail runner',
      sets: [s(3, 1, 6)],
      topic: 'urban-shoes',
    }),
  ],
  // Hayden
  2: [deriveOf('julian-4', { key: 'hayden-d1', title: 'Night glaze vases', sets: [s(4, 2, 8)] })],
  // Nick
  3: [
    deriveOf('julian-1', {
      key: 'nick-d1',
      title: 'Lounge chair by the window',
      sets: [s(2, 0, 2)],
    }),
  ],
};

export const CREATOR_SPECS: CreatorSpec[] = [
  ...BASE_CREATOR_SPECS.map((c) =>
    c.kind === 'persona'
      ? { ...c, projects: [...c.projects, ...(SHOWCASE_DERIVES[c.order] ?? [])] }
      : c,
  ),
  SHOWCASE_SPEC,
];

/**
 * 계획을 만드는 순서. 파생 원작이 먼저 계획돼야 하므로 쇼케이스 계정을 다른 persona 앞에 둔다
 * (적재도 이 순서라 원작 프로젝트 행이 먼저 들어간다).
 */
export const PLAN_ORDER: CreatorSpec[] = [
  ...CREATOR_SPECS.filter((c) => c.kind === 'seed'),
  SHOWCASE_SPEC,
  ...CREATOR_SPECS.filter((c) => c.kind === 'persona' && c !== SHOWCASE_SPEC),
];

/**
 * 프로젝트 번호(노드 라이브러리·집계 초기값의 씨앗). 예전 순서(seed → persona → 쇼케이스)를 그대로 두고
 * 쇼케이스 파생작(#247)은 맨 뒤 번호를 받는다. 계획 순서가 바뀌어도 기존 프로젝트의 값은 같다.
 */
const PROJECT_INDEX = new Map(
  [
    ...BASE_CREATOR_SPECS.flatMap((c) => c.projects),
    ...SHOWCASE_SPEC.projects,
    ...Object.values(SHOWCASE_DERIVES).flat(),
  ].map((p, i) => [p.key, i]),
);

export function projectIndexOf(key: string): number {
  const index = PROJECT_INDEX.get(key);
  if (index === undefined) throw new Error(`Unknown seed project ${key}`);
  return index;
}

/** 저장소 대체 이미지 파일 키(project-images/<키>.jpg). 파생은 원작 이미지를 따른다. */
export function imageFileKeyOf(spec: ProjectSpec): string {
  if (spec.derivedFrom) return imageFileKeyOf(baseProject(spec.derivedFrom));
  if (spec.imageFrom) return spec.imageFrom;
  return spec.key;
}

/** 자산 폴더의 시안 이미지 이름(seed/projects/<이름>.jpg). 파생은 원작 이미지를 따른다. 없으면 null. */
export function figmaImageOf(spec: ProjectSpec): string | null {
  if (spec.derivedFrom) return figmaImageOf(baseProject(spec.derivedFrom));
  return spec.figma ?? null;
}

/** 저장소 이미지를 생성해야 하는 프로젝트인가(다른 이미지를 같이 쓰지 않는 것). */
export const needsOwnImage = (spec: ProjectSpec): boolean => imageFileKeyOf(spec) === spec.key;

const seed = (order: number): CreatorRef => ({ kind: 'seed', order });
const persona = (order: number): CreatorRef => ({ kind: 'persona', order });
const showcase: CreatorRef = persona(SHOWCASE_PERSONA_ORDER);
const erick = persona(1);
const hayden = persona(2);
const nick = persona(3);

/**
 * 시드 댓글(아고라). 앞 5개는 seed 작성자끼리, 그 뒤 3개는 쇼케이스 계정이 주고받은 것.
 * 9번째부터(#247)는 시안 프로젝트 상세(Comments (12))처럼 댓글이 여럿 달린 모습: Urban Trail 의 청키 스니커에 12개,
 * 쇼케이스 게시작에 seed·persona 댓글. seed 끼리의 댓글은 앞 5개뿐이다. 순서가 id 이므로 뒤에만 더한다.
 */
export const SEED_COMMENTS: { project: string; author: CreatorRef; body: string }[] = [
  { project: 'isla-1', author: seed(1), body: 'The sole shape looks ready for any trail.' },
  { project: 'dove-1', author: seed(3), body: 'That copper glow is so warm.' },
  { project: 'rhys-1', author: seed(5), body: 'The curve pulls you right into the frame.' },
  { project: 'mara-1', author: seed(2), body: 'The backlit bridge feels cinematic.' },
  { project: 'teo-1', author: seed(4), body: 'Simple and warm, great desk mood.' },
  { project: 'dove-4', author: showcase, body: 'This shelf gave me the idea for my red version.' },
  { project: 'julian-1', author: seed(5), body: 'Lovely soft shape, very calm.' },
  { project: 'julian-11', author: seed(5), body: 'Nice take on my lamp, the light feels softer.' },
  // 청키 트레일 스니커(시안 Urban Trail 상세) — 12개
  {
    project: 'isla-2',
    author: erick,
    body: 'The sculpted sole carries the whole shoe. I would wear this on a city trail.',
  },
  {
    project: 'isla-2',
    author: hayden,
    body: 'Mint laces against the grey knit are such a quiet surprise.',
  },
  {
    project: 'isla-2',
    author: nick,
    body: 'The floating shadow sells the weight of the sole without any props.',
  },
  {
    project: 'isla-2',
    author: showcase,
    body: 'Going to derive this and try a coral sole next to the mint.',
  },
  {
    project: 'isla-2',
    author: erick,
    body: 'How many versions did the sole take? The layering looks very deliberate.',
  },
  { project: 'isla-2', author: hayden, body: 'This should be the cover of the Urban Trail topic.' },
  {
    project: 'isla-2',
    author: nick,
    body: 'Clean background, clear subject. Nothing extra to explain.',
  },
  {
    project: 'isla-2',
    author: showcase,
    body: 'The side view makes the tread read like architecture.',
  },
  { project: 'isla-2', author: erick, body: 'Saving this as a reference for my sandal straps.' },
  {
    project: 'isla-2',
    author: hayden,
    body: 'I would love to see it at night with wet pavement under it.',
  },
  { project: 'isla-2', author: nick, body: 'The knit texture holds up even at thumbnail size.' },
  {
    project: 'isla-2',
    author: showcase,
    body: 'Quiet palette, loud sole. Exactly the balance I look for.',
  },
  // 시안 프로젝트 상세의 댓글 예시 문장
  {
    project: 'rhys-5',
    author: hayden,
    body: 'The Cerulean Blue typography treatment is pure perfection. Taking that iconic monologue and turning it into a Swiss grid layout gave me chills. Going to remix this into my workspace right now.',
  },
  // 쇼케이스 게시작에 달린 댓글
  {
    project: 'julian-1',
    author: erick,
    body: 'The boucle looks soft enough to touch.',
  },
  {
    project: 'julian-1',
    author: seed(3),
    body: 'Six versions and the shadow finally sits right. Worth it.',
  },
  {
    project: 'julian-2',
    author: seed(2),
    body: 'You kept my quiet shadow and made the red louder. Nice remix.',
  },
  {
    project: 'julian-4',
    author: seed(1),
    body: 'Ruby next to cobalt is a bold pair. The plinths keep it calm.',
  },
  {
    project: 'julian-5',
    author: seed(4),
    body: 'Love how far you pushed the blue away from my version.',
  },
  {
    project: 'julian-6',
    author: seed(4),
    body: 'That coral sole is so good. It feels like a summer trail shoe.',
  },
  {
    project: 'julian-8',
    author: seed(3),
    body: 'The chrome legs read sharp even through the smoked glass.',
  },
  {
    project: 'julian-6',
    author: erick,
    body: 'Borrowed this for my own trail runner. Thank you for posting it.',
  },
];

/**
 * 시드 노드 코멘트(캔버스 노드의 분홍 코너·띠, 시안 1720:92379 Corner 멘트). 대부분 주인이 노드를 바꾼 이유를
 * "…, so I'm … this node." 로 남긴 것이다. set·version 은 1부터(version = 답변 번호 Answer 0N).
 * nodeId 는 그 답변 스냅샷의 노드(k·d·s·e·a) 또는 검증 기준(v1·v2)이다(불일치 m 은 안 된다).
 * 주인의 이유는 앞 버전에서 실제로 바뀐 노드에 단다(buildNodes): k1 은 버전 2, k2 는 2~5, a1 은 2~7, a3 은 3 에서
 * 바뀐다(파생은 원작 버전 번호를 이어서 센다).
 * 순서가 id 이므로 뒤에만 더한다.
 */
export interface NodeCommentSpec {
  project: string;
  set: number;
  version: number;
  nodeId: string;
  author: CreatorRef;
  body: string;
}

export const SEED_NODE_COMMENTS: NodeCommentSpec[] = [
  // julian-1 Cloud lounge chair (Answer 01~06)
  {
    project: 'julian-1',
    set: 1,
    version: 2,
    nodeId: 'k1',
    author: showcase,
    body: "The chair is the whole story, so I'm turning this node up.",
  },
  {
    project: 'julian-1',
    set: 1,
    version: 3,
    nodeId: 'a3',
    author: showcase,
    body: "The three-quarter view shows the curve of the back, so I'm making this node stronger.",
  },
  {
    project: 'julian-1',
    set: 1,
    version: 4,
    nodeId: 'k2',
    author: showcase,
    body: "A warmer beige keeps the cream from looking grey, so I'm moving this node.",
  },
  {
    project: 'julian-1',
    set: 1,
    version: 5,
    nodeId: 'a1',
    author: showcase,
    body: "The shadow was pulling focus from the boucle, so I'm softening this node.",
  },
  {
    project: 'julian-1',
    set: 1,
    version: 6,
    nodeId: 'v1',
    author: showcase,
    body: "The chair reads at a glance now, so I'm keeping this check on.",
  },
  {
    project: 'julian-1',
    set: 1,
    version: 6,
    nodeId: 'k1',
    author: seed(3),
    body: 'This weight is what makes the chair feel heavy and soft at once.',
  },
  // julian-2 Red steel shelf (리믹스, 상대 Ceredic)
  {
    project: 'julian-2',
    set: 1,
    version: 2,
    nodeId: 'a1',
    author: showcase,
    body: "Ceredic would keep the shadow quiet, so I'm lowering this node.",
  },
  {
    project: 'julian-2',
    set: 1,
    version: 3,
    nodeId: 'k2',
    author: showcase,
    body: "The thin planes read cleaner from lower down, so I'm moving this node.",
  },
  {
    project: 'julian-2',
    set: 1,
    version: 3,
    nodeId: 'a3',
    author: showcase,
    body: "A close crop hides the wall seams, so I'm rewriting this node.",
  },
  // julian-4 Glazed vase pair (Answer 01~05)
  {
    project: 'julian-4',
    set: 1,
    version: 2,
    nodeId: 'k1',
    author: showcase,
    body: "The pair should own the frame, so I'm raising this node.",
  },
  {
    project: 'julian-4',
    set: 1,
    version: 3,
    nodeId: 'a3',
    author: showcase,
    body: "Eye level makes the two heights read clearly, so I'm making this node stronger.",
  },
  {
    project: 'julian-4',
    set: 1,
    version: 5,
    nodeId: 'a1',
    author: showcase,
    body: "Glossy highlights hid the glaze, so I'm softening this node.",
  },
  // julian-5 Powder blue pendant (리믹스, 상대 Judy, Answer 01~06)
  {
    project: 'julian-5',
    set: 1,
    version: 2,
    nodeId: 'k1',
    author: showcase,
    body: "The lamp should fill the frame, so I'm raising this node.",
  },
  {
    project: 'julian-5',
    set: 1,
    version: 3,
    nodeId: 'a3',
    author: showcase,
    body: "A low angle shows the inside of the shade, so I'm making this node stronger.",
  },
  {
    project: 'julian-5',
    set: 1,
    version: 4,
    nodeId: 'k2',
    author: showcase,
    body: "The walnut cap got lost at the top, so I'm moving this node.",
  },
  {
    project: 'julian-5',
    set: 1,
    version: 5,
    nodeId: 'a1',
    author: showcase,
    body: "The glow washed out the blue, so I'm turning this node down.",
  },
  {
    project: 'julian-5',
    set: 1,
    version: 6,
    nodeId: 'v2',
    author: showcase,
    body: "The style finally matches the prompt, so I'm leaving this check as it is.",
  },
  // julian-11 Warm task lamp 파생(원작 Jay)과 그 원작
  {
    project: 'julian-11',
    set: 1,
    version: 2,
    nodeId: 'a1',
    author: showcase,
    body: "The bulb glow reads warmer with less shine, so I'm lowering this node.",
  },
  {
    project: 'teo-1',
    set: 1,
    version: 2,
    nodeId: 'k1',
    author: seed(5),
    body: "The lamp has to stand out from the desk, so I'm raising this node.",
  },
  // julian-6 Coral runner(한 버전): 검증 기준
  {
    project: 'julian-6',
    set: 1,
    version: 1,
    nodeId: 'v1',
    author: showcase,
    body: "The coral sole is the subject, so I'm keeping this check on.",
  },
  // 쇼케이스 계정을 리믹스 상대로 고른 작업들
  {
    project: 'mara-2',
    set: 1,
    version: 2,
    nodeId: 'a1',
    author: seed(1),
    body: "Julian would keep the rim calmer, so I'm softening this node.",
  },
  {
    project: 'isla-3',
    set: 1,
    version: 3,
    nodeId: 'a3',
    author: seed(4),
    body: "Julian frames things tight, so I'm pushing this node further.",
  },
  {
    project: 'priya-2',
    set: 1,
    version: 2,
    nodeId: 'k2',
    author: erick,
    body: "Julian lets a facade breathe, so I'm moving this node.",
  },
  {
    project: 'owen-1',
    set: 1,
    version: 2,
    nodeId: 'a1',
    author: hayden,
    body: "The glow was too loud next to Julian's calm take, so I'm lowering this node.",
  },
  // 쇼케이스 게시작에서 파생한 작업
  {
    project: 'erick-d1',
    set: 1,
    version: 2,
    nodeId: 'k1',
    author: erick,
    body: "The runner needs more presence on the trail, so I'm raising this node.",
  },
  {
    project: 'hayden-d1',
    set: 1,
    version: 2,
    nodeId: 'a1',
    author: hayden,
    body: "Night light needs less shine on the glaze, so I'm lowering this node.",
  },
  {
    project: 'nick-d1',
    set: 1,
    version: 2,
    nodeId: 'a1',
    author: nick,
    body: "Window light already softens the shadow, so I'm lowering this node.",
  },
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
