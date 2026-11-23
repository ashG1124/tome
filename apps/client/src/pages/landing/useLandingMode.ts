import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import { useLocation } from 'react-router';
import {
  decideStoryMode,
  frameDeltas,
  isSlowDevice,
  MEASURE_MS,
  rememberSlow,
  wasSlow,
  type StoryMode,
} from './motionMode';
import { NO_PREFERENCE, prefersReducedMotion } from './motion';

function subscribeReducedMotion(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(NO_PREFERENCE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** 감시 대상이 처음 화면에 들어올 때 약 1초간 프레임 간격을 재서 느리면 onSlow 를 부른다. */
function useSlowDetection(ref: RefObject<HTMLElement | null>, active: boolean, onSlow: () => void) {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el || typeof IntersectionObserver === 'undefined') return;
    let raf = 0;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      const stamps: number[] = [];
      const start = performance.now();
      const tick = (now: number) => {
        stamps.push(now);
        if (now - start < MEASURE_MS) {
          raf = requestAnimationFrame(tick);
          return;
        }
        if (isSlowDevice(frameDeltas(stamps))) {
          rememberSlow();
          onSlow();
        }
      };
      raf = requestAnimationFrame(tick);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [ref, active, onSlow]);
}

/**
 * 랜딩 연출을 켤지(motion) 정지 화면으로 보여 줄지(static) 정한다.
 * 움직임 줄이기·`?motion=off`·느린 PC 중 하나라도 해당하면 정지 화면이다. 느린 PC 판정은 watch 가 화면에 들어올 때 잰다.
 */
export function useLandingMode(watch: RefObject<HTMLElement | null>): StoryMode {
  const { search } = useLocation();
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => false,
  );
  const [slow, setSlow] = useState(wasSlow);
  const mode = decideStoryMode({ search, reducedMotion, slow });
  useSlowDetection(watch, mode === 'motion', () => setSlow(true));
  return mode;
}
