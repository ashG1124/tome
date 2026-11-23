import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { COPY } from '../../shared/copy';
import { DeriveChapter } from './chapters/DeriveChapter';
import { MyWorkChapter } from './chapters/MyWorkChapter';
import { RemixChapter } from './chapters/RemixChapter';
import { HeroSection } from './HeroSection';
import { LandingFooter } from './LandingFooter';
import { LandingHeader, type ChapterId } from './LandingHeader';
import { ScrollTrigger } from './motion';
import { ThreeWaysSection } from './ThreeWaysSection';
import { useLandingMode } from './useLandingMode';
import { useSmoothScroll } from './useSmoothScroll';
import { VisionSection } from './VisionSection';
import { VolumesBanner } from './VolumesBanner';
import './landing.css';

/**
 * 시안 폭(1920)을 기준으로 그리고 화면 폭에 비례해 줄여 보여 주는 틀.
 * 안쪽 요소는 `--landing-unit`(디자인 단위 1칸의 길이)만 곱해 크기를 정한다.
 */
export function LandingScale({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-frame">
      <div className="landing-scale">{children}</div>
    </div>
  );
}

/**
 * 인트로 랜딩. 앱 상태·데이터를 읽지 않는 정적 페이지다.
 * 순서: 히어로 → Our Vision → Volumes of Thinking → Three ways → MY WORK → REMIX → DERIVE → 푸터.
 * 연출을 켤지는 `useLandingMode` 가 정한다(움직임 줄이기면 Lenis·ScrollTrigger 없이 정지 화면).
 */
export function LandingPage() {
  const logoRef = useRef<HTMLAnchorElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const mode = useLandingMode(storyRef);
  const motion = mode === 'motion';
  const scroll = useSmoothScroll(motion);
  const [active, setActive] = useState<ChapterId>('mywork');
  const [headerClear, setHeaderClear] = useState(false);

  // 들어오면 맨 위에서 시작한다(새로고침·뒤로 가기도). 떠날 때 원래 복원 방식으로 되돌린다.
  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  // 지금 보이는 챕터를 메뉴에 표시한다
  useEffect(() => {
    const triggers = Array.from(document.querySelectorAll<HTMLElement>('[data-chapter]')).map(
      (chapter) =>
        ScrollTrigger.create({
          trigger: chapter,
          start: 'top 60%',
          end: 'bottom 40%',
          onToggle: (self) => {
            if (self.isActive) setActive(chapter.dataset.chapter as ChapterId);
          },
        }),
    );
    return () => {
      for (const trigger of triggers) trigger.kill();
    };
  }, [mode]);

  // 이미지가 자리를 잡은 뒤(페이지 load) 위치를 한 번 다시 잰다
  useEffect(() => {
    const refresh = () => requestAnimationFrame(() => ScrollTrigger.refresh());
    if (document.readyState === 'complete') {
      refresh();
      return;
    }
    window.addEventListener('load', refresh, { once: true });
    return () => window.removeEventListener('load', refresh);
  }, [mode]);

  const goToChapter = useCallback(
    (id: ChapterId) => {
      const target = document.getElementById(id);
      if (target) scroll.scrollTo(target);
    },
    [scroll],
  );

  const backToTop = useCallback(() => {
    scroll.scrollTo(0, 1.8);
    logoRef.current?.focus({ preventScroll: true });
  }, [scroll]);

  return (
    <LandingScale>
      <LandingHeader
        logoRef={logoRef}
        active={active}
        clear={headerClear}
        onNavigate={goToChapter}
      />
      <HeroSection />
      <VisionSection />
      <VolumesBanner />
      <ThreeWaysSection />
      <div ref={storyRef} data-story-mode={mode} aria-label={COPY['ON-22']} role="group">
        <MyWorkChapter motion={motion} onHeaderClear={setHeaderClear} />
        <RemixChapter motion={motion} />
        <DeriveChapter motion={motion} />
      </div>
      <LandingFooter onBackToTop={backToTop} />
    </LandingScale>
  );
}
