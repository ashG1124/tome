// 시안 비교 케이스 목록. Playwright(Node)가 읽으므로 화면 컴포넌트를 import 하지 않는다.
// 케이스를 그리는 코드는 harness/renders.tsx 에 같은 id 로 둔다.

/** 시안과 일부러 다르게 만든 부분. max 는 diffRatio 상한이고 reason 에는 다른 이유를 적는다. */
export interface AllowedDiff {
  max: number;
  /** 가장 큰 연결 덩어리 상한(선택). 없으면 공통 BLOB_REVIEW_MIN. 테두리 전체가 한 덩어리로 잡히는 케이스용 */
  maxBlob?: number;
  reason: string;
}

export interface DesignCase {
  /** 슬래시로 묶는다: `<컴포넌트>/<변형>` */
  id: string;
  /** 저장소 루트 기준 참조 PNG 경로 (1x) */
  ref: string;
  width: number;
  height: number;
  /** true 이면 스크린샷 전에 대상 안의 입력칸에 포커스를 준다. */
  focus?: boolean;
  allowedDiff?: AllowedDiff;
}

const REF_DIR = 'design-ref/components/title-input-modal';

// 입력칸 테두리는 시안(#C5CBD7 50%, 흰 바탕 1.26:1)보다 진한 --color-border-input(#898F9C, 3:1)이다.
// 실측: done diffRatio 5.86%·largestBlob 1408 → max 6.4%(+0.5%p), maxBlob 1500.
const BORDER_DIFF: AllowedDiff = {
  max: 0.064,
  maxBlob: 1500,
  reason: '입력칸 테두리 3:1(--color-border-input #898F9C, 시안 #C5CBD7 50%)',
};
// default 는 안내 글자 색도 시안(#A4A9B3, 2.36:1)보다 진하다(#6A7281).
// 실측: default diffRatio 5.88%·largestBlob 1408 → max 6.4%(+0.5%p).
const DEFAULT_DIFF: AllowedDiff = {
  ...BORDER_DIFF,
  reason:
    '입력칸 테두리 3:1(--color-border-input #898F9C, 시안 #C5CBD7 50%)과 안내 글자 색 진하게(#A4A9B3 → #6A7281)',
};

export const cases: DesignCase[] = [
  {
    id: 'title-input/default',
    ref: `${REF_DIR}/property-1-default__3182-176484.png`,
    width: 650,
    height: 48,
    allowedDiff: DEFAULT_DIFF,
  },
  {
    id: 'title-input/writing',
    ref: `${REF_DIR}/property-1-writing__3182-176485.png`,
    width: 650,
    height: 48,
    focus: true,
  },
  {
    id: 'title-input/done',
    ref: `${REF_DIR}/property-1-done__3182-176486.png`,
    width: 650,
    height: 48,
    allowedDiff: BORDER_DIFF,
  },
];

// ---- 공통 부품: 플래시(1187:62709)·탭(Identity Segment 1897:65652)
const FLASH_DIR = 'design-ref/components/flash-message';
const SEGMENT_DIR = 'design-ref/components/identity-segment';
// 플래시: 알약 끝(293px)·아이콘(22~42px)·글자 시작(53~54px)이 시안과 1px 안. 차이는 글자 테두리 렌더링.
// 실측 diffRatio done 13.63%·update 13.32%(blob 470)·stack 14.71%(blob 552) → 각 +0.5%p.
const flashDiff = (max: number, maxBlob?: number): AllowedDiff => ({
  max,
  ...(maxBlob === undefined ? {} : { maxBlob }),
  reason:
    '영어 문장 글자 테두리 렌더링 차이(Figma 정적 폰트 vs 브라우저 가변 폰트), 위치·크기는 1px 안',
});
// 탭: 위치·폭은 시안과 같다. 고르지 않은 탭의 테두리(3:1 --color-border-input)와 글자색(--color-font-helper-text)을
// 시안보다 진하게 했다(TitleInput 과 같은 이유). 실측 work 17.46%·identity 18.33%·compare 19.69%, blob 최대 636 → +0.5%p.
const tabsDiff = (max: number): AllowedDiff => ({
  max,
  maxBlob: 690,
  reason: '고르지 않은 탭 테두리 3:1·글자색 진하게(시안보다 대비 높임) + 글자 렌더링',
});
cases.push(
  {
    id: 'flash/done',
    ref: `${FLASH_DIR}/property-1-done__1187-62708.png`,
    width: 294,
    height: 44,
    allowedDiff: flashDiff(0.142),
  },
  {
    id: 'flash/update',
    ref: `${FLASH_DIR}/property-1-update__2474-124268.png`,
    width: 278,
    height: 44,
    allowedDiff: flashDiff(0.139, 520),
  },
  {
    id: 'flash/stack',
    ref: `${FLASH_DIR}/property-1-stack__1187-62707.png`,
    width: 430,
    height: 44,
    allowedDiff: flashDiff(0.153, 600),
  },
  {
    id: 'tabs/work',
    ref: `${SEGMENT_DIR}/property-1-work__1897-65649.png`,
    width: 277,
    height: 46,
    allowedDiff: tabsDiff(0.18),
  },
  {
    id: 'tabs/identity',
    ref: `${SEGMENT_DIR}/property-1-identity__1897-65650.png`,
    width: 277,
    height: 46,
    allowedDiff: tabsDiff(0.189),
  },
  {
    id: 'tabs/compare',
    ref: `${SEGMENT_DIR}/property-1-compare__1897-65651.png`,
    width: 277,
    height: 46,
    allowedDiff: tabsDiff(0.202),
  },
);
