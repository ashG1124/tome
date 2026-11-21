import { useCallback, useLayoutEffect, useRef } from 'react';
import { HeroSection } from './HeroSection';
import { LandingFooter } from './LandingFooter';
import { LandingHeader } from './LandingHeader';
import { prefersReducedMotion } from './motion';
import { StorySection } from './story/StorySection';
import { ThreeWaysSection } from './ThreeWaysSection';
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
 * 스토리 구간(#47)은 `ThreeWaysSection` 과 푸터 사이에 있다.
 */
export function LandingPage() {
  const logoRef = useRef<HTMLAnchorElement>(null);

  // 들어오면 맨 위에서 시작한다(새로고침·뒤로 가기도). 떠날 때 원래 복원 방식으로 되돌린다.
  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  const backToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    logoRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <LandingScale>
      <LandingHeader logoRef={logoRef} />
      <HeroSection />
      <VisionSection />
      <VolumesBanner />
      <ThreeWaysSection />
      <StorySection />
      <LandingFooter onBackToTop={backToTop} />
    </LandingScale>
  );
}
