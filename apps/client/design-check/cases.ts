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
