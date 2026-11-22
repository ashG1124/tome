/**
 * 스토리 DERIVE 장의 롤링 띠 데모 데이터(시안 3337:211082). 앱 데이터가 아니라 연출용 정적 값이다.
 * 이미지는 onboarding 자산 폴더의 파일 이름이다(없으면 회색 자리 표시).
 */
export interface RollProject {
  title: string;
  image: string;
  avatar: string;
}
export interface RollCreator {
  name: string;
  role: string;
  avatar: string;
}
export interface RollTopic {
  title: string;
  /** 제목 굵기: 시안에서 카드마다 SemiBold 또는 Medium */
  strong: boolean;
  /** 왼쪽 위, 오른쪽 위, 왼쪽 아래, 오른쪽 아래 순서 */
  cells: readonly [string, string, string, string];
  more: string;
}

export const ROLL_PROJECTS: readonly RollProject[] = [
  {
    title: 'Cyber-cympathy',
    image: 'story-roll-project-01.webp',
    avatar: 'story-roll-project-01-avatar.webp',
  },
  {
    title: 'Lifestyle furniture',
    image: 'story-roll-project-02.webp',
    avatar: 'story-roll-project-02-avatar.webp',
  },
  {
    title: 'Nomad workspace',
    image: 'story-roll-project-03.webp',
    avatar: 'story-roll-project-03-avatar.webp',
  },
  {
    title: 'Hydroponic cell',
    image: 'story-roll-project-04.webp',
    avatar: 'story-roll-project-04-avatar.webp',
  },
  {
    title: 'Sound armor',
    image: 'story-roll-project-05.webp',
    avatar: 'story-roll-project-05-avatar.webp',
  },
  {
    title: 'Graphic identity / type',
    image: 'story-roll-project-06.webp',
    avatar: 'story-roll-project-06-avatar.webp',
  },
  {
    title: 'Kinetic craft',
    image: 'story-roll-project-07.webp',
    avatar: 'story-roll-project-07-avatar.webp',
  },
  {
    title: 'Cozy-Tea set',
    image: 'story-roll-project-08.webp',
    avatar: 'story-roll-project-08-avatar.webp',
  },
  {
    title: 'Mythical kitchen',
    image: 'story-roll-project-09.webp',
    avatar: 'story-roll-project-09-avatar.webp',
  },
];

export const ROLL_CREATORS: readonly RollCreator[] = [
  { name: 'Lind', role: 'Global Implementation Manager', avatar: 'story-roll-creator-01.webp' },
  { name: 'Ceredic', role: 'Dynamic Interactions Engineer', avatar: 'story-roll-creator-02.webp' },
  { name: 'Nichole', role: 'Direct Optimization Engineer', avatar: 'story-roll-creator-03.webp' },
  { name: 'Jay', role: 'Human Assurance Supervisor', avatar: 'story-roll-creator-04.webp' },
  { name: 'Judy', role: 'International Response Designer', avatar: 'story-roll-creator-05.webp' },
  { name: 'Hayden', role: 'Lead Security Executive', avatar: 'story-roll-creator-06.webp' },
  { name: 'Milla', role: 'Senior Data Strategist', avatar: 'story-roll-creator-07.webp' },
  { name: 'Rose', role: 'Regional Creative Strategist', avatar: 'story-roll-creator-08.webp' },
  { name: 'Erick', role: 'Product Implementation Director', avatar: 'story-roll-creator-09.webp' },
  {
    name: 'Nick',
    role: 'International Intranet Coordinator',
    avatar: 'story-roll-creator-10.webp',
  },
  { name: 'Posy', role: 'National Usability Facilitator', avatar: 'story-roll-creator-11.webp' },
];

export const ROLL_TOPICS: readonly RollTopic[] = [
  {
    title: 'Sculptural architecture',
    strong: true,
    cells: [
      'story-roll-topic-01-tl.webp',
      'story-roll-topic-01-tr.webp',
      'story-roll-topic-01-bl.webp',
      'story-roll-topic-01-br.webp',
    ],
    more: '+16',
  },
  {
    title: 'Urban Trail',
    strong: true,
    cells: [
      'story-roll-topic-02-tl.webp',
      'story-roll-topic-02-tr.webp',
      'story-roll-topic-02-bl.webp',
      'story-roll-topic-02-br.webp',
    ],
    more: '+34',
  },
  {
    title: 'MV Concept Shots',
    strong: false,
    cells: [
      'story-roll-topic-03-tl.webp',
      'story-roll-topic-03-tr.webp',
      'story-roll-topic-03-bl.webp',
      'story-roll-topic-03-br.webp',
    ],
    more: '+25',
  },
  {
    title: 'Warm Task Lighting',
    strong: true,
    cells: [
      'story-roll-topic-04-tl.webp',
      'story-roll-topic-04-tr.webp',
      'story-roll-topic-04-bl.webp',
      'story-roll-topic-04-br.webp',
    ],
    more: '+98',
  },
  {
    title: 'Concept Car Sketch',
    strong: false,
    cells: [
      'story-roll-topic-05-tl.webp',
      'story-roll-topic-05-tr.webp',
      'story-roll-topic-05-bl.webp',
      'story-roll-topic-05-br.webp',
    ],
    more: '+95',
  },
  {
    title: 'Sci-Fi Film Still',
    strong: false,
    cells: [
      'story-roll-topic-06-tl.webp',
      'story-roll-topic-06-tr.webp',
      'story-roll-topic-06-bl.webp',
      'story-roll-topic-06-br.webp',
    ],
    more: '+95',
  },
  {
    title: 'Album Cover Art',
    strong: false,
    cells: [
      'story-roll-topic-07-tl.webp',
      'story-roll-topic-07-tr.webp',
      'story-roll-topic-07-bl.webp',
      'story-roll-topic-07-br.webp',
    ],
    more: '+95',
  },
  {
    title: 'Development of modern park',
    strong: true,
    cells: [
      'story-roll-topic-08-tl.webp',
      'story-roll-topic-08-tr.webp',
      'story-roll-topic-08-bl.webp',
      'story-roll-topic-08-br.webp',
    ],
    more: '+102',
  },
];
