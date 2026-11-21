import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useLayoutEffect, type RefObject } from 'react';

gsap.registerPlugin(ScrollTrigger);

export const NO_PREFERENCE = '(prefers-reduced-motion: no-preference)';

/** 움직임 줄이기가 아닐 때만 setup 을 실행한다. 돌려준 함수는 정리 때 불린다. 정리 때 트윈·ScrollTrigger 를 모두 되돌린다. */
export function useLandingMotion(
  ref: RefObject<HTMLElement | null>,
  setup: (root: HTMLElement) => void | (() => void),
) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || typeof window.matchMedia !== 'function') return;
    const mm = gsap.matchMedia();
    mm.add(NO_PREFERENCE, () => setup(root), root);
    return () => mm.revert();
  }, [ref, setup]);
}

/** 디자인 단위(1920 기준) 한 칸이 화면에서 몇 px 인지 */
export function unitOf(root: HTMLElement): number {
  return Math.min(root.clientWidth, 1920) / 1920;
}

/** 요소가 화면에 들어올 때 한 번 페이드업 */
export function fadeUpOnEnter(targets: gsap.TweenTarget, root: HTMLElement, distance = 32) {
  gsap.from(targets, {
    opacity: 0,
    y: () => distance * unitOf(root),
    duration: 0.8,
    ease: 'power2.out',
    scrollTrigger: { trigger: targets as gsap.DOMTarget, start: 'top 85%', once: true },
  });
}

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && !window.matchMedia(NO_PREFERENCE).matches;
}

export { gsap, ScrollTrigger };
