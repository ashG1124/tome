import { useLayoutEffect, type RefObject } from 'react';
import { gsap, NO_PREFERENCE, ScrollTrigger, unitOf } from '../motion';

/** 타임라인 1칸(단위)이 스크롤 몇 px 에 해당하는지: 화면 높이의 55% */
const VIEWPORT_PER_UNIT = 0.55;

export interface ChapterContext {
  /** 장 맨 바깥 요소 */
  root: HTMLElement;
  /** 고정(pin)되는 화면 한 장 */
  stage: HTMLElement;
  /** 디자인 단위 1칸의 px */
  unit: () => number;
  /** 장 안 요소 찾기 */
  q: <T extends Element = HTMLElement>(selector: string) => T[];
  /** 한 칸짜리 요소 찾기(없으면 에러) */
  one: <T extends Element = HTMLElement>(selector: string) => T;
}

/** 이 장의 스크롤 길이(px). 화면 높이에 비례한다. */
export function chapterScrollLength(duration: number): number {
  return Math.round(duration * VIEWPORT_PER_UNIT * window.innerHeight);
}

/** 장 하나를 pin + scrub 타임라인으로 묶는다. `duration` 은 타임라인 전체 길이(단위). */
export function createChapterTimeline(
  ctx: ChapterContext,
  duration: number,
  extra: ScrollTrigger.Vars = {},
): gsap.core.Timeline {
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: ctx.stage,
      pin: true,
      start: 'top top',
      end: () => `+=${chapterScrollLength(duration)}`,
      scrub: 0.5,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      ...extra,
    },
  });
  // 길이를 고정하려고 빈 트윈으로 끝을 잡는다
  tl.to({}, { duration: 0.0001 }, duration);
  return tl;
}

/** 장이 화면에 다가오면(한 화면 앞) 이미지를 미리 불러오고 decode 해 둔다. 한 번만. */
export function prefetchWhenNear(root: HTMLElement) {
  ScrollTrigger.create({
    trigger: root,
    start: 'top bottom+=100%',
    once: true,
    onEnter: () => {
      for (const img of root.querySelectorAll('img')) {
        img.loading = 'eager';
        if (typeof img.decode === 'function') void img.decode().catch(() => undefined);
      }
    },
  });
}

/**
 * 움직임 줄이기가 아닐 때만 `setup` 을 실행한다(gsap.matchMedia). 정리 때 트윈·ScrollTrigger 를 모두 되돌린다.
 * `setup` 이 돌려준 함수는 정리 때 불린다.
 */
export function useStoryChapter(
  ref: RefObject<HTMLElement | null>,
  setup: (ctx: ChapterContext) => void | (() => void),
) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || typeof window.matchMedia !== 'function') return;
    const stage = root.querySelector<HTMLElement>('[data-stage]');
    if (!stage) return;
    const ctx: ChapterContext = {
      root,
      stage,
      unit: () => unitOf(root),
      q: <T extends Element = HTMLElement>(selector: string) =>
        gsap.utils.toArray<T>(selector, root),
      one: <T extends Element = HTMLElement>(selector: string) => {
        const el = root.querySelector<T>(selector);
        if (!el) throw new Error(`story: ${selector} 없음`);
        return el;
      },
    };
    const mm = gsap.matchMedia();
    mm.add(
      NO_PREFERENCE,
      () => {
        prefetchWhenNear(root);
        return setup(ctx);
      },
      root,
    );
    return () => mm.revert();
    // setup 은 장마다 한 번만 만든다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
}
