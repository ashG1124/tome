import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import { COPY } from '../../../shared/copy';
import { NO_PREFERENCE, prefersReducedMotion, ScrollTrigger } from '../motion';
import { DeriveChapter } from './DeriveChapter';
import { MyWorkChapter } from './MyWorkChapter';
import { RemixChapter, type RemixControl } from './RemixChapter';
import { StaticStory } from './StaticStory';
import {
  decideStoryMode,
  frameDeltas,
  isSlowDevice,
  MEASURE_MS,
  rememberSlow,
  wasSlow,
  type StoryMode,
} from './storyMode';
import './story.css';

function subscribeReducedMotion(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(NO_PREFERENCE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** 스토리 영역이 처음 화면에 들어올 때 약 1초간 프레임 간격을 재서 느리면 onSlow 를 부른다. */
function useSlowDetection(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onSlow: () => void,
) {
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
 * 스크롤 스토리(Three ways 와 푸터 사이). MY WORK → REMIX → DERIVE 순서로 앱 사용 장면을 연출한다.
 * 앱 데이터를 읽지 않는다(앱 화면은 이미지, 롤링 띠만 정적 마크업).
 * 연출을 켤지(motion) 정지 화면으로 보여 줄지(static)는 `decideStoryMode` 가 정한다.
 */
export function StorySection() {
  const { search } = useLocation();
  const ref = useRef<HTMLElement>(null);
  const controlRef = useRef<RemixControl | null>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => false,
  );
  const [slow, setSlow] = useState(wasSlow);
  const mode: StoryMode = decideStoryMode({ search, reducedMotion, slow });

  useSlowDetection(ref, mode === 'motion', () => setSlow(true));

  // 이미지가 자리를 잡은 뒤(페이지 load) 위치를 한 번 다시 잰다. 모드가 바뀌어도 한 번.
  useEffect(() => {
    const refresh = () => requestAnimationFrame(() => ScrollTrigger.refresh());
    if (mode === 'static' || document.readyState === 'complete') {
      refresh();
      return;
    }
    window.addEventListener('load', refresh, { once: true });
    return () => window.removeEventListener('load', refresh);
  }, [mode]);

  return (
    <section ref={ref} aria-label={COPY['ON-22']} data-story-mode={mode} className="story">
      {mode === 'motion' ? (
        <>
          <MyWorkChapter />
          <RemixChapter controlRef={controlRef} />
          <DeriveChapter />
        </>
      ) : (
        <StaticStory />
      )}
    </section>
  );
}
