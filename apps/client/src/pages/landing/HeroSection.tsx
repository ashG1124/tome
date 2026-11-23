import { useCallback, useRef, type CSSProperties } from 'react';
import { COPY } from '../../shared/copy';
import { HERO_TILES, type HeroTile } from './heroTiles';
import { LandingImage } from './LandingImage';
import { LandingLogo } from './LandingLogo';
import { gsap, unitOf, useLandingMotion } from './motion';

/** 스크롤 시차: 깊이 1 이 화면 폭의 몇 배만큼 위로 밀리는지 */
const PARALLAX = 0.3;
/** 떠다니는 폭(디자인 단위, 깊이 1 기준) */
const DRIFT_X = 5;
const DRIFT_Y = 9;
/** 마우스를 따라가는 폭(디자인 단위, 깊이 1 기준) */
const POINTER_X = 16;
const POINTER_Y = 12;

function tileStyle(tile: HeroTile): CSSProperties {
  return {
    '--x': tile.x,
    '--y': tile.y,
    '--w': tile.w,
    '--h': tile.h,
    '--r': tile.r,
    '--o': tile.opacity ?? 1,
  } as CSSProperties;
}

/**
 * 히어로 사진 콜라주. 헤더 아래가 아니라 페이지 맨 위에서 시작한다(헤더가 위에 겹친다).
 * 연출: 사진이 하나씩 자리 잡고 → 스크롤하면 깊이별로 다르게 위로 밀리고 → 가만히 있어도 천천히 떠다니며 → 마우스를 따라 살짝 움직인다.
 * 이미지는 모두 장식이다.
 */
export function HeroSection() {
  const ref = useRef<HTMLElement>(null);

  const setup = useCallback((root: HTMLElement) => {
    const tiles = gsap.utils.toArray<HTMLElement>('[data-hero-tile]', root);
    const images = gsap.utils.toArray<HTMLElement>('[data-hero-enter]', root);
    const logo = root.querySelector<HTMLElement>('[data-hero-logo]');
    const unit = () => unitOf(root);
    const scroll = {
      trigger: root,
      start: 'top top',
      end: 'bottom top',
      scrub: true,
      invalidateOnRefresh: true,
    };

    tiles.forEach((tile, index) => {
      const depth = HERO_TILES[index]?.depth ?? 0;
      gsap.fromTo(
        tile,
        { y: 0 },
        {
          y: () => -depth * window.innerWidth * PARALLAX,
          ease: 'none',
          immediateRender: false,
          scrollTrigger: scroll,
        },
      );
    });
    if (logo) {
      gsap.fromTo(
        logo,
        { y: 0 },
        {
          y: () => -0.3 * window.innerWidth * PARALLAX,
          ease: 'none',
          immediateRender: false,
          scrollTrigger: scroll,
        },
      );
    }

    // 떠다님 + 마우스 깊이: CSS translate 로 그려서 시차(transform)와 겹쳐 쓴다
    const drift = tiles.map((el, index) => ({
      el,
      depth: HERO_TILES[index]?.depth ?? 0,
      phase: index * 1.7,
      speed: 0.55 + ((index * 37) % 10) / 22,
    }));
    let pointerX = 0;
    let pointerY = 0;
    let easedX = 0;
    let easedY = 0;
    let visible = false;
    const onMove = (event: PointerEvent) => {
      pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
      pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              visible = entries[0]?.isIntersecting ?? false;
            },
            { rootMargin: '100px' },
          );
    observer?.observe(root);
    const tick = (time: number) => {
      if (!visible && observer) return;
      easedX += (pointerX - easedX) * 0.04;
      easedY += (pointerY - easedY) * 0.04;
      const u = unit();
      for (const item of drift) {
        const wave = time * item.speed * 0.6 + item.phase;
        const x =
          (Math.sin(wave * 0.8) * DRIFT_X * item.depth - easedX * POINTER_X * item.depth) * u;
        const y = (Math.cos(wave) * DRIFT_Y * item.depth - easedY * POINTER_Y * item.depth) * u;
        item.el.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
      }
    };
    gsap.ticker.add(tick);

    // 첫 진입: 사진이 하나씩 자리 잡고, 로고가 이어서 떠오른다
    gsap.from(images, {
      opacity: 0,
      scale: 1.08,
      duration: 1.2,
      ease: 'power3.out',
      stagger: { each: 0.06, from: 'random' },
      delay: 0.1,
    });
    if (logo) gsap.from(logo, { opacity: 0, duration: 1.1, ease: 'power3.out', delay: 0.45 });

    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener('pointermove', onMove);
      observer?.disconnect();
      for (const el of tiles) el.style.translate = '';
    };
  }, []);
  useLandingMotion(ref, setup);

  return (
    <section ref={ref} className="landing-hero" aria-labelledby="landing-title">
      {HERO_TILES.map((tile, index) => (
        <div
          key={`${tile.image}-${tile.x}-${tile.y}`}
          data-hero-tile
          className="landing-hero-tile"
          style={tileStyle(tile)}
        >
          <div data-hero-enter className="landing-fill">
            <LandingImage
              file={tile.image}
              loading={index < 8 ? 'eager' : 'lazy'}
              className="landing-hero-img"
            />
          </div>
        </div>
      ))}
      <div aria-hidden="true" className="landing-hero-fade landing-hero-fade-top" />
      <div aria-hidden="true" className="landing-hero-fade landing-hero-fade-bottom" />
      <div data-hero-logo className="landing-hero-logo">
        <h1 id="landing-title" className="landing-hero-h1">
          <LandingLogo size={{ mark: 73.846, wordWidth: 166, wordHeight: 96 }} />
          <span className="sr-only">{COPY['W-06']}</span>
        </h1>
        <p className="landing-hero-tagline">{COPY['ON-04']}</p>
      </div>
    </section>
  );
}
