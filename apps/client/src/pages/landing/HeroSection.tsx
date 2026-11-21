import { useCallback, useRef, type CSSProperties } from 'react';
import { COPY } from '../../shared/copy';
import { HERO_IMAGES, heroDepth, LANDING_LAYOUT, type HeroImage } from './heroImages';
import { LandingImage } from './LandingImage';
import { LandingLogo } from './LandingLogo';
import { gsap, unitOf, useLandingMotion } from './motion';

/** 스크롤할 때 가운데에서 바깥으로 밀려나는 거리(디자인 단위, 깊이 1 기준) */
const SCATTER_X = 90;
const SCATTER_Y = 340;
/** 마우스를 따라 움직이는 최대 거리(디자인 단위, 깊이 1 기준) */
const POINTER_MAX = 12;

function tileStyle(image: HeroImage): CSSProperties {
  return {
    '--x': image.x,
    '--y': image.y - LANDING_LAYOUT.headerHeight,
    '--w': image.w,
    '--h': image.h,
    '--r': image.radius,
    '--o': image.opacity,
  } as CSSProperties;
}

/** 히어로(3445:27232): 로고 + 태그라인 + 흩어진 이미지 + 위·아래 흰 페이드. 이미지는 모두 장식이다. */
export function HeroSection() {
  const ref = useRef<HTMLElement>(null);

  const setup = useCallback((root: HTMLElement) => {
    const tiles = gsap.utils.toArray<HTMLElement>('[data-hero-tile]', root);
    const pointers = gsap.utils.toArray<HTMLElement>('[data-hero-pointer]', root);
    const enters = gsap.utils.toArray<HTMLElement>('[data-hero-enter]', root);
    const logoIn = root.querySelector<HTMLElement>('[data-hero-logo-in]');
    const logoOut = root.querySelector<HTMLElement>('[data-hero-logo-out]');
    const unit = () => unitOf(root);

    // (a) 첫 진입: 작고 투명한 상태에서 시안 위치로 차례로 나타난다
    gsap.from(enters, { opacity: 0, scale: 0.9, duration: 0.9, ease: 'power2.out', stagger: 0.06 });
    if (logoIn) {
      gsap.from(logoIn, {
        opacity: 0,
        y: () => 24 * unit(),
        duration: 1,
        delay: 0.15,
        ease: 'power2.out',
      });
    }

    // (b) 스크롤: 이미지마다 다른 속도로 위·바깥으로 흩어지고, 로고는 천천히 사라진다
    const scroll = { trigger: root, start: 0, end: () => `+=${root.offsetHeight}`, scrub: true };
    tiles.forEach((tile, index) => {
      const image = HERO_IMAGES[index];
      if (!image) return;
      const depth = heroDepth(image);
      const half = LANDING_LAYOUT.designWidth / 2;
      const side = (image.x + image.w / 2 - half) / half;
      gsap.to(tile, {
        x: () => side * SCATTER_X * depth * unit(),
        y: () => -SCATTER_Y * depth * unit(),
        ease: 'none',
        scrollTrigger: scroll,
      });
    });
    if (logoOut) {
      gsap.to(logoOut, {
        opacity: 0,
        ease: 'none',
        scrollTrigger: {
          trigger: root,
          start: 0,
          end: () => `+=${root.offsetHeight * 0.5}`,
          scrub: true,
        },
      });
    }

    // (c) 마우스: 깊이별로 아주 조금 따라 움직인다
    const movers = pointers.map((el, index) => {
      const image = HERO_IMAGES[index];
      return {
        depth: image ? heroDepth(image) : 1,
        x: gsap.quickTo(el, 'x', { duration: 0.8, ease: 'power3.out' }),
        y: gsap.quickTo(el, 'y', { duration: 0.8, ease: 'power3.out' }),
      };
    });
    const onMove = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;
      for (const mover of movers) {
        mover.x(nx * 2 * POINTER_MAX * mover.depth * unit());
        mover.y(ny * 2 * POINTER_MAX * mover.depth * unit());
      }
    };
    root.addEventListener('pointermove', onMove);
    return () => root.removeEventListener('pointermove', onMove);
  }, []);
  useLandingMotion(ref, setup);

  return (
    <section ref={ref} className="landing-hero" aria-labelledby="landing-title">
      {HERO_IMAGES.map((image) => (
        <div key={image.node} data-hero-tile className="landing-hero-tile" style={tileStyle(image)}>
          <div data-hero-pointer className="landing-fill">
            <div data-hero-enter className="landing-fill">
              <LandingImage
                file={image.file}
                loading={image.y < LANDING_LAYOUT.firstScreen ? 'eager' : 'lazy'}
                className="landing-hero-img"
              />
            </div>
          </div>
        </div>
      ))}
      <div aria-hidden="true" className="landing-hero-fade landing-hero-fade-top" />
      <div aria-hidden="true" className="landing-hero-fade landing-hero-fade-bottom" />
      <div data-hero-logo-out className="landing-hero-logo">
        <div data-hero-logo-in className="landing-hero-logo-in">
          <h1 id="landing-title" className="landing-hero-h1">
            <LandingLogo size={{ mark: 73.846, wordWidth: 166, wordHeight: 96 }} />
            <span className="sr-only">{COPY['W-06']}</span>
          </h1>
          <p className="landing-hero-tagline">{COPY['ON-04']}</p>
        </div>
      </div>
    </section>
  );
}
