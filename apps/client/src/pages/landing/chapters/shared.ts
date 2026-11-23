import { gsap, ScrollTrigger } from '../motion';

/**
 * 스토리 챕터(MY WORK·REMIX·DERIVE)가 함께 쓰는 값과 도우미.
 * 기준안 좌표(1728×1117 기준): 앱 화면 캡처는 1728×1117 칸 위에 절대 위치로 겹쳐 놓고, 그 칸을 통째로 줄여 보여 준다.
 * 아래 숫자는 연출용 기하값이라 토큰이 아니라 상수로 둔다.
 */

/** 앱 화면 캡처 한 장의 칸 크기(기준안 좌표 1728×1117) */
export const APP_W = 1728;
export const APP_H = 1117;
export const APP_RATIO = APP_W / APP_H;
/** 헤더 높이(px). 챕터 배치가 이 값을 뺀 나머지 높이로 계산한다. */
export const HEADER_H = 61;
/** 시안 폭(1920) */
export const DESIGN_W = 1920;

/** onboarding 자산 폴더의 기준안 이미지 파일 이름 */
export const ob = (name: string): string => `ob2-${name}.webp`;
/** 기준안 `a/ag/<hash>.webp` 이미지 파일 이름 */
export const obAg = (hash: string): string => `ob2-ag-${hash}.webp`;

/** 챕터 한 장을 화면에 고정(pin)하고 스크롤로 재생할 때 쓰는 ScrollTrigger 설정. len 은 화면 높이의 몇 배만큼 스크롤할지 */
export function pinOptions(stage: Element, len: number): ScrollTrigger.Vars {
  return {
    trigger: stage,
    start: 'top top',
    end: () => `+=${window.innerHeight * len}`,
    pin: true,
    scrub: 1.4,
    anticipatePin: 1,
    invalidateOnRefresh: true,
  };
}

/** 창 같은 앱 화면의 그림자(화면 배율 s 에 비례) */
export function windowShadow(s: number): string {
  return `0 ${(4 * s).toFixed(2)}px ${(20 * s).toFixed(2)}px rgba(84,88,99,.10),0 ${(36 * s).toFixed(2)}px ${(90 * s).toFixed(2)}px -${(12 * s).toFixed(2)}px rgba(84,88,99,.16)`;
}

/** 위에서 아래로 열리듯 나타나기 */
export function wipeDown(tl: gsap.core.Timeline, el: gsap.TweenTarget, at: number, d = 0.45) {
  return tl.fromTo(
    el,
    { clipPath: 'inset(0% 0% 100% 0%)', opacity: 0 },
    { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1, duration: d, ease: 'power2.out' },
    at,
  );
}

/** 왼쪽에서 오른쪽으로 그려지듯 나타나기 */
export function wipeRight(tl: gsap.core.Timeline, el: gsap.TweenTarget, at: number, d = 0.3) {
  return tl.fromTo(
    el,
    { clipPath: 'inset(0% 100% 0% 0%)', opacity: 1 },
    { clipPath: 'inset(0% 0% 0% 0%)', duration: d, ease: 'none' },
    at,
  );
}

/** 커서 클릭 표시(고리가 퍼지고 화살표가 살짝 눌린다). cursor 는 `.ring` 과 `svg` 를 안에 가진 요소 */
export function cursorClick(tl: gsap.core.Timeline, cursor: Element, at: number) {
  const ring = cursor.querySelector('.landing-cursor-ring');
  const arrow = cursor.querySelector('svg');
  if (ring) {
    tl.fromTo(
      ring,
      { scale: 0.4, opacity: 0.9 },
      { scale: 1.6, opacity: 0, duration: 0.35, ease: 'power2.out' },
      at,
    );
  }
  if (arrow) {
    tl.to(
      arrow,
      { scale: 0.85, duration: 0.08, yoyo: true, repeat: 1, transformOrigin: '6px 3px' },
      at,
    );
  }
}

/** 타임라인의 [a,b) 구간을 f 배로 늘리거나 줄인다. 구간 뒤는 그만큼 밀린다. */
export function stretchRange(tl: gsap.core.Timeline, a: number, b: number, f: number) {
  for (const child of tl.getChildren(false, true, true)) {
    const t = child.startTime();
    if (t >= b) {
      child.startTime(t + (b - a) * (f - 1));
    } else if (t >= a) {
      child.startTime(a + (t - a) * f);
      if (child.duration()) child.duration(child.duration() * f);
    }
  }
}
