/**
 * MY WORK·REMIX 연출용 데모 데이터(가짜 영어 문구).
 * 화면 문구(copy)가 아니라 데모 화면 안의 예시 내용이라 이 파일에 둔다.
 */

/** 프롬프트 노드·타자 연출에 쓰는 데모 프롬프트 */
export const DEMO_PROMPT =
  "Please visualise a scene for a music video I'm making — a girl in a school uniform standing in a wide green grass field, with a single cloud floating in the blue sky directly above her. She's reaching a hand up to try and catch it.";

/** 노드 안에 들어가는 한 칸의 종류 */
export type EntryKind = 'chip' | 'toggle' | 'rank' | 'check' | 'issue';

/**
 * 노드 열의 한 칸(라벨 + 칩).
 * rows: 칩 안의 줄 묶음. 한 줄 묶음 안의 문자열이 한 줄씩이다(줄 바꿈을 직접 정해 폰트가 달라도 높이가 같다).
 */
export interface DemoEntry {
  label?: string;
  kind: EntryKind;
  rows: readonly (readonly string[])[];
}

export type StepId = 's1' | 's2' | 's3' | 's4' | 's5';

export interface DemoStep {
  id: StepId;
  /** 헤더에 보이는 번호 */
  no: number;
  entries: readonly DemoEntry[];
}

const chip = (text: string, label?: string): DemoEntry => ({
  label,
  kind: 'chip',
  rows: [[text]],
});

export const DEMO_STEPS: readonly DemoStep[] = [
  {
    id: 's1',
    no: 1,
    entries: [
      chip('Girl in school uniform', 'Keywords'),
      chip('Single cloud overhead'),
      chip('Reaching to catch it'),
      chip('Wide green field'),
    ],
  },
  {
    id: 's2',
    no: 2,
    entries: [
      chip('Film stills', 'Data type'),
      {
        label: 'Search priority',
        kind: 'rank',
        rows: [
          ['Forced perspective', 'gestures'],
          ['Single cloud', 'compositions'],
          ['Uniform in open', 'landscape'],
          ['Music video'],
        ],
      },
    ],
  },
  {
    id: 's3',
    no: 3,
    entries: [
      {
        label: 'Sentence supporting the answer',
        kind: 'toggle',
        rows: [['Forced perspective needs', 'the camera low.']],
      },
      { kind: 'toggle', rows: [['Hand and target must', 'overlap in frame.']] },
      { kind: 'toggle', rows: [['A lone cloud draws the eye', 'upward.']] },
      { kind: 'toggle', rows: [['Overhead objects fall', 'outside a level frame.']] },
      { kind: 'toggle', rows: [['Uniforms read as age', 'before anything else.']] },
      { kind: 'toggle', rows: [['Wide fields shrink gestures', 'to nothing.']] },
      { kind: 'toggle', rows: [['Familiar images need one', 'unexpected element.']] },
    ],
  },
  {
    id: 's4',
    no: 4,
    entries: [
      chip('Low angle, camera tilted up', 'Framing & Staging'),
      chip('Cloud sits just past her fingers'),
      { kind: 'chip', rows: [['Field compressed to a low', 'band']] },
      chip('Flat midday blue', 'Light & Colour'),
      chip('Uniform dark against the sky'),
      chip('Grass bright in the lower band'),
      chip('Single cloud, soft edges', 'Effect & Detail'),
      chip('Fingers open, not closed'),
      chip('Hair and hem lifting slightly'),
    ],
  },
  {
    id: 's5',
    no: 5,
    entries: [
      {
        label: 'Verification criteria',
        kind: 'check',
        rows: [
          ['Keywords reflected'],
          ['Gesture reads clearly'],
          ['Field vs gesture scale'],
          ['Works as a key frame'],
        ],
      },
      { label: 'Discrepancies', kind: 'issue', rows: [['Field barely visible now']] },
      { kind: 'issue', rows: [['Cloud too far from hand']] },
      { kind: 'issue', rows: [['Reads like a stock image']] },
    ],
  },
];

/** 노드 컨트롤 장면: 점을 끌어 옮기는 2차원 판의 가장자리 이름 */
export const DEMO_PLOT_LABELS = {
  top: 'Surrounding',
  bottom: 'Horizon',
  left: 'Textured',
  right: 'Smooth',
} as const;

/** REMIX: 다른 창작자가 다르게 판단했을 노드(단계 id → 칸 번호) */
export const REMIX_CHANGED: Readonly<Partial<Record<StepId, readonly number[]>>> = {
  s3: [2],
  s4: [4, 7],
};

/** REMIX: 커넥션이 없는 열(프롬프트·1·5단계)이 한꺼번에 물러서는 정도 */
export const REMIX_DIM_COLUMN = 0.65;
/** REMIX: 바뀌지 않는 칸이 물러서는 정도 */
export const REMIX_DIM_ENTRY = 0.5;

/** REMIX: 배너에 뜨는 창작자의 의견(데모) */
export const REMIX_COMMENT: readonly string[] = [
  'I would have moved Half-dome reflector',
  'to the top.',
];
