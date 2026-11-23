import { useCallback, useId, useRef } from 'react';
import { COPY } from '../../shared/copy';
import { LandingImage } from './LandingImage';
import { gsap, ScrollTrigger, useLandingMotion } from './motion';

/**
 * 책장 조각 한 쪽(안쪽 조각 → 바깥 조각 3장)의 모양과 흰색 그라데이션 범위.
 * 기준안 좌표(796×749.922 칸 기준). 왼쪽은 같은 모양을 좌우로 뒤집어 쓴다.
 */
const PAGE_BOX = { w: 796, h: 749.922 };
const PAGES = [
  {
    d: 'M0.925426 252.069C0.327633 252.787 0.000335693 253.692 0.000335693 254.627V496.234C0.000335693 496.234 0.000633233 496.234 0.00100027 496.234C0.00119791 496.234 0.0013853 496.234 0.00151156 496.235L203.569 741.398C205.962 744.279 210.647 742.588 210.647 738.843V11.0618C210.647 7.31903 205.966 5.62636 203.572 8.50351L0.925426 252.069Z',
    x1: 0.000335693,
    x2: 210.647,
  },
  {
    d: 'M474.189 35.5357C474.189 32.4174 470.779 30.4983 468.114 32.1163L90.6233 261.246C89.4285 261.971 88.6989 263.267 88.6989 264.665V484.79C88.6989 486.187 89.4272 487.482 90.6203 488.208L468.111 717.796C470.776 719.417 474.189 717.498 474.189 714.379V35.5357Z',
    x1: 88.6989,
    x2: 474.189,
  },
  {
    d: 'M742 487.039L742 262.414L742 34.4349C742 31.579 739.094 29.6431 736.458 30.7441L184.402 261.387C182.913 262.009 181.944 263.465 181.944 265.078L181.943 484.377C181.943 485.99 182.911 487.444 184.398 488.067L736.455 719.172C739.09 720.275 742 718.34 742 715.482L742 487.039Z',
    x1: 181.943,
    x2: 742,
  },
] as const;

/** 스크롤 길이(화면 높이의 배수): 고정된 채 책이 열리는 구간 */
const PIN_LEN = 1.4;

function Pages({ side }: { side: 'left' | 'right' }) {
  const id = useId();
  return (
    <div data-page={side} className={`landing-volumes-page landing-volumes-page-${side}`}>
      <svg
        viewBox={`0 0 ${PAGE_BOX.w} ${PAGE_BOX.h}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="landing-volumes-svg"
      >
        <defs>
          {PAGES.map((page, index) => (
            <linearGradient
              key={page.d}
              id={`${id}-${index}`}
              gradientUnits="userSpaceOnUse"
              x1={page.x1}
              y1={PAGE_BOX.h / 2}
              x2={page.x2}
              y2={PAGE_BOX.h / 2}
            >
              <stop className="landing-volumes-stop-from" offset="0" />
              <stop className="landing-volumes-stop-to" offset="1" />
            </linearGradient>
          ))}
        </defs>
        <g opacity={0.6}>
          {PAGES.map((page, index) => (
            <path
              key={page.d}
              d={page.d}
              fill={`url(#${id}-${index})`}
              className="landing-volumes-path"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

/**
 * "Volumes of Thinking" 배너. 화면에 고정(pin)된 채 책이 등뼈에서부터 열린다:
 * 양쪽 책장이 안쪽으로 모이며 펼쳐지고 → 제목이 떠오르고 → 위 가림막이 걷히고 아래 가림막이 덮인다.
 * 움직이는 것은 transform·opacity 뿐이다.
 */
export function VolumesBanner() {
  const ref = useRef<HTMLElement>(null);
  const setup = useCallback((root: HTMLElement) => {
    const pages = gsap.utils.toArray<HTMLElement>('[data-page]', root);
    const title = root.querySelector<HTMLElement>('[data-title]');
    const fadeTop = root.querySelector<HTMLElement>('[data-fade-top]');
    const fadeBottom = root.querySelector<HTMLElement>('[data-fade-bottom]');
    const vh = () => window.innerHeight;

    gsap.set(fadeBottom, { opacity: 0 });
    ScrollTrigger.create({
      trigger: root,
      start: 'top top',
      end: () => `+=${vh() * PIN_LEN}`,
      pin: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: root,
        start: 'top 50%',
        end: () => `+=${vh() * (0.5 + PIN_LEN)}`,
        scrub: 1.4,
        invalidateOnRefresh: true,
      },
    });
    tl.fromTo(
      pages,
      { xPercent: (index: number) => (index ? -30.3 : 30.3) },
      { xPercent: 0, duration: 1.6, ease: 'power2.inOut' },
      0.1,
    );
    for (const page of pages) {
      tl.fromTo(
        page.querySelectorAll('path'),
        { scaleX: 0.08, opacity: 0 },
        { scaleX: 1, opacity: 1, duration: 1.4, ease: 'power2.out', stagger: 0.3 },
        0.1,
      );
    }
    if (title) {
      tl.fromTo(
        title,
        { opacity: 0, y: 30, letterSpacing: '0.02em' },
        { opacity: 1, y: 0, letterSpacing: '-0.03em', duration: 1.3, ease: 'power2.out' },
        0.45,
      );
    }
    tl.to({}, { duration: 0.5 }, 2.4);
    tl.fromTo(fadeTop, { opacity: 1 }, { opacity: 0, duration: 0.45, ease: 'power1.inOut' }, 0.78);
    tl.fromTo(fadeBottom, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power1.in' }, 2.4);
  }, []);
  useLandingMotion(ref, setup);

  return (
    <section ref={ref} className="landing-volumes" aria-labelledby="landing-volumes-title">
      <LandingImage file="ob2-vot_bg.webp" loading="lazy" className="landing-volumes-bg-img" />
      <div aria-hidden="true" data-fade-top className="landing-volumes-fade-top" />
      <div aria-hidden="true" data-fade-bottom className="landing-volumes-fade-bottom" />
      <Pages side="left" />
      <Pages side="right" />
      <h2 id="landing-volumes-title" data-title className="landing-volumes-title">
        <span className="landing-volumes-strong">{COPY['ON-08a']}</span> {COPY['ON-08b']}
      </h2>
    </section>
  );
}
