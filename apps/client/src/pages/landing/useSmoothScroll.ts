import Lenis from 'lenis';
import { useEffect, useRef, useState } from 'react';
import { gsap, ScrollTrigger } from './motion';

export interface SmoothScroll {
  /** 요소(또는 맨 위)까지 부드럽게 스크롤 */
  scrollTo: (target: Element | number, duration?: number) => void;
}

/**
 * Lenis 부드러운 스크롤을 켜고 ScrollTrigger 와 이어 준다(기준안: duration 1.15, 휠 스무딩).
 * enabled 가 false(움직임 줄이기 등)면 아무것도 켜지 않고, scrollTo 는 브라우저 기본 스크롤로 움직인다.
 * 화면을 떠날 때 Lenis 를 destroy 하고 ticker 에서 떼어 로그인 뒤 화면 스크롤에 영향이 남지 않게 한다.
 */
export function useSmoothScroll(enabled: boolean): SmoothScroll {
  const lenisRef = useRef<Lenis | null>(null);
  const [api] = useState<SmoothScroll>(() => ({
    scrollTo(target, duration) {
      const lenis = lenisRef.current;
      if (lenis) {
        lenis.scrollTo(target, duration === undefined ? undefined : { duration });
        return;
      }
      if (typeof target === 'number') {
        window.scrollTo({ top: target, behavior: 'auto' });
      } else {
        target.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    },
  }));

  useEffect(() => {
    if (!enabled) return;
    const lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    lenisRef.current = lenis;
    const onScroll = () => ScrollTrigger.update();
    lenis.on('scroll', onScroll);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(raf);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.off('scroll', onScroll);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [enabled]);

  return api;
}
