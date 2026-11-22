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
  gradientAngle?: number;
  /** true 이면 움직임 줄이기(prefers-reduced-motion: reduce)로 연다 — 연출이 있는 화면의 정지 상태 비교용 */
  reducedMotion?: boolean;
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
  // ---- 홈 서가(#23): 사진 없는 카드(좁을 때) 3종류와 + Project 칸
  {
    id: 'home-thumbnail/my-work',
    ref: 'design-ref/components/home-thumbnail/project-type-my-work-bg-img-off-hover-off__1226-80117.png',
    width: 108,
    height: 192,
    allowedDiff: cardTextDiff(0.1003),
  },
  {
    id: 'home-thumbnail/remix',
    ref: 'design-ref/components/home-thumbnail/project-type-remix-bg-img-off-hover-off__1226-79005.png',
    width: 108,
    height: 192,
    allowedDiff: cardTextDiff(0.0976),
  },
  {
    // 이 시안만 제목이 다른 변형보다 1px 아래(1226:79054 top 183 vs 182)라 조금 더 다르다.
    id: 'home-thumbnail/derive',
    ref: 'design-ref/components/home-thumbnail/project-type-derive-bg-img-off-hover-off__1226-79054.png',
    width: 108,
    height: 192,
    allowedDiff: cardTextDiff(0.1384),
  },
  {
    // 시안 그림은 점선 테두리가 상자 밖으로 1px 씩 나와 110×194 다. 하네스가 1px 띄워 그린다.
    // 실측: diffRatio 6.20% → max 6.7%(+0.5%p).
    id: 'thumbnail-new-project/default',
    ref: 'design-ref/components/thumbnail-new-project/new-project__1185-58168.png',
    width: 110,
    height: 194,
    allowedDiff: {
      max: 0.067,
      reason:
        '점선 3:1(--color-border-input #898F9C, 시안 #A4A9B3)과 글자·아이콘 색 진하게(#A4A9B3 → #6A7281), 브라우저 점선 간격',
    },
  },
];

/**
 * 홈 카드: 한글 제목(18px SemiBold 3줄)과 태그 글자의 테두리 픽셀이 시안 그림(Figma 정적 SemiBold)과
 * 브라우저(Pretendard Variable 600) 사이에서 다르게 그려진다. 위치·크기·색은 같다(±2px 이동 시험에서 0px 이 가장 작음,
 * 제목 색 #121212·태그 바탕 같음). 실측값 + 0.5%p 를 상한으로 둔다.
 */
function cardTextDiff(max: number): AllowedDiff {
  return {
    max,
    reason: '한글 제목·태그 글자 테두리 렌더링 차이(Figma 정적 폰트 vs 브라우저 가변 폰트)',
  };
}

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

cases.push({
  id: 'canvas/keyword',
  ref: 'design-ref/components/step-1-keyword/open-off__1226-67936.png',
  width: 301,
  height: 60,
});
for (const [index, angle] of [270, 237.53, 180, 122.47, 90, 57.53, 0, 302.47].entries()) {
  const number = String(index + 1).padStart(2, '0');
  cases.push({
    id: `canvas/preview-generating-${number}`,
    ref: `design-ref/components/tome-generate/property-1-${number}__1192-${64320 + index}.png`,
    width: 440,
    height: 280,
    gradientAngle: angle,
  });
}
// ---- 리믹스 알약(#41): Control 1720:80418. 그림에 그림자 여백 20px 이 둘러져 있다.
// 'Remix with' 글자·알약 크기는 시안과 같게 맞췄고, 아바타 자리(시안은 사진·체크 무늬)는 이름 머리글자 동그라미다.
const CONTROL_DIR = 'design-ref/components/control';
// 실측: selected diffRatio 14.90%·blob 1310, done 10.88%·blob 901 → 각 +0.5%p. 알약 크기·위치·글자 자리는 시안과 같다.
// 차이는 서체(시안은 Pretendard, 구현은 Open Sans)와 사진 자리(시안은 사진·체크 무늬, 구현은 이름 머리글자 동그라미).
const remixPillDiff = (max: number, maxBlob: number): AllowedDiff => ({
  max,
  maxBlob,
  reason:
    '서체(시안 Pretendard, 구현 Open Sans)와 아바타 자리(시안은 사진·체크 무늬, 구현은 이름 머리글자)',
});
cases.push(
  {
    id: 'control/remix-selected',
    ref: `${CONTROL_DIR}/type-remix-status-selected__1720-80489.png`,
    width: 352,
    height: 88,
    allowedDiff: remixPillDiff(0.154, 1400),
  },
  {
    id: 'control/remix-done',
    ref: `${CONTROL_DIR}/type-remix-status-done__1720-80415.png`,
    width: 287,
    height: 88,
    allowedDiff: remixPillDiff(0.114, 1000),
  },
);
// ---- 아고라 크리에이터 알약(#39): Creater 3188:178010(294×68)
// 실측: diffRatio 18.90%·blob 1273 → +0.5%p. 알약 크기·글자 위치는 시안과 2px 안이다.
// 차이는 서체(시안 Pretendard, 구현 Open Sans)와 사진 자리(시안은 사진, 구현은 이름 머리글자 동그라미).
// (Recommended Project 카드는 시안의 사진 자리가 투명 체크무늬 빈 그림이라 픽셀 비교 의미가 없어 케이스를 넣지 않았다.)
cases.push({
  id: 'agora-cards/creator',
  ref: 'design-ref/components/agora-cards/creater__3188-178010.png',
  width: 294,
  height: 68,
  allowedDiff: {
    max: 0.194,
    maxBlob: 1400,
    reason: '서체(시안 Pretendard, 구현 Open Sans)와 사진 자리(시안은 사진, 구현은 이름 머리글자)',
  },
});

cases.push(
  {
    id: 'node-editor/weighting',
    ref: 'design-ref/components/keyword/select-weighting__1226-68293.png',
    width: 300,
    height: 300,
  },
  {
    id: 'node-editor/meaning',
    ref: 'design-ref/components/keyword/select-meaning__1226-68294.png',
    width: 251,
    height: 307,
  },
  {
    id: 'node-editor/preview-generating',
    ref: 'design-ref/components/preview/status-generating-open-on__1311-122067.png',
    width: 480,
    height: 385,
    gradientAngle: 270,
  },
  {
    id: 'node-editor/preview-ready',
    ref: 'design-ref/components/preview/status-done-open-on__1311-122244.png',
    width: 480,
    height: 385,
  },
);

// ---- 인트로 랜딩(#46, 리뉴얼 #149로 푸터만 남김): 온보딩 시안 폭 1920. 연출은 움직임 줄이기로 꺼서 정지 상태를 비교한다.
// 서체 차이(Poppins → Open Sans, ADR-034·ADR-042)와 글자색 진하게(안내 글자 #A4A9B3 → #6A7281)로 글자 모양이 다르다.
const LANDING_DIR = 'design-ref/onboarding';
// 실측(diffRatio·largestBlob)에 +0.5%p 를 상한으로 둔다. 차이는 글자 테두리·모양뿐이고 그림·배치는 같다.
const landingFontDiff = (max: number, maxBlob: number, extra = ''): AllowedDiff => ({
  max,
  maxBlob,
  reason: `서체 Poppins → Open Sans(ADR-042), 글자 폭·모양 차이${extra}`,
});
cases.push({
  id: 'landing/footer',
  ref: `${LANDING_DIR}/Footer__3445-27495.png`,
  width: 1920,
  height: 486,
  reducedMotion: true,
  allowedDiff: landingFontDiff(
    0.027,
    1700,
    '. 시안의 Explore·Get Started 열은 일부러 뺐다(연결 기능 없는 링크 금지)',
  ),
});
cases.push(
  {
    id: 'canvas-history/corner',
    ref: 'design-ref/components/corner/property-1-closed__1185-60669.png',
    width: 44,
    height: 44,
  },
  {
    id: 'canvas-history/pin-off',
    ref: 'design-ref/components/answer-pin/bg-light-pinned-off__3182-174887.png',
    width: 44,
    height: 44,
  },
  {
    id: 'canvas-history/pin-on',
    ref: 'design-ref/components/answer-pin/bg-light-pinned-on__3182-174891.png',
    width: 44,
    height: 44,
  },
);
