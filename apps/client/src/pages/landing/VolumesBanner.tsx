import { useCallback, useRef, type CSSProperties } from 'react';
import { COPY } from '../../shared/copy';
import { landingAsset } from './assets';
import { gsap, unitOf, useLandingMotion } from './motion';

function maskFor(file: string): CSSProperties {
  const url = landingAsset(file);
  if (url === undefined) return {};
  const image = `url("${url}")`;
  return { maskImage: image, WebkitMaskImage: image };
}

const PIECES = [
  { side: 'left', file: 'landing-volumes-left.svg' },
  { side: 'right', file: 'landing-volumes-right.svg' },
] as const;

/** 책장 조각이 바깥에서 들어오는 거리(디자인 단위) */
const SLIDE = 260;

/**
 * "Volumes of Thinking" 배너(3330:206106). 정지 상태가 시안(그라데이션 바탕 + 흰 반투명 조각)이다.
 * 스크롤 진행에 맞춰: 조각이 안쪽으로 펼쳐지고 → 바탕이 노랑에서 복숭아·분홍으로 → 조각이 분홍 기운에서 흰색으로.
 * 움직이는 것은 transform·opacity 뿐이다(색은 겹친 층의 투명도로 바꾼다).
 */
export function VolumesBanner() {
  const ref = useRef<HTMLElement>(null);
  const setup = useCallback((root: HTMLElement) => {
    const q = (selector: string) => gsap.utils.toArray<HTMLElement>(selector, root);
    const unit = () => unitOf(root);
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: root, start: 'top 85%', end: 'center 35%', scrub: true },
    });
    // 진행 0 = 시안 4단계 중 첫 상태(노란 바탕 + 분홍 조각), 진행 1 = 정지 시안 상태
    tl.fromTo(q('[data-bg-yellow]'), { opacity: 0.6 }, { opacity: 0, duration: 1 }, 0.3)
      .fromTo(q('[data-piece-pink]'), { opacity: 0.5 }, { opacity: 0, duration: 1 }, 0.6)
      .from(q('[data-slide="left"]'), { x: () => -SLIDE * unit(), duration: 1 }, 0)
      .from(q('[data-slide="right"]'), { x: () => SLIDE * unit(), duration: 1 }, 0)
      .from(q('[data-bg-image]'), { opacity: 0, duration: 1 }, 0.3)
      .from(q('[data-piece-white]'), { opacity: 0, duration: 1 }, 0.6);
  }, []);
  useLandingMotion(ref, setup);

  const bg = landingAsset('landing-volumes-bg.webp');
  return (
    <section ref={ref} className="landing-volumes" aria-labelledby="landing-volumes-title">
      <div aria-hidden="true" className="landing-volumes-bg">
        {bg === undefined ? null : (
          <img data-bg-image src={bg} alt="" loading="lazy" className="landing-volumes-bg-img" />
        )}
        <div data-bg-yellow className="landing-volumes-yellow" />
      </div>
      <div aria-hidden="true" className="landing-volumes-pieces">
        {PIECES.map(({ side, file }) => (
          <div
            key={side}
            data-slide={side}
            className={`landing-volumes-slide landing-volumes-${side}`}
          >
            <div className="landing-volumes-flip">
              <div
                data-piece-pink
                className="landing-volumes-piece landing-volumes-pink"
                style={maskFor(file)}
              />
              <div
                data-piece-white
                className="landing-volumes-piece landing-volumes-white"
                style={maskFor(file)}
              />
            </div>
          </div>
        ))}
      </div>
      <h2 id="landing-volumes-title" className="landing-volumes-title">
        <span className="landing-volumes-strong">{COPY['ON-08a']}</span> {COPY['ON-08b']}
      </h2>
    </section>
  );
}
