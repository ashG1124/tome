import { useCallback, useRef } from 'react';
import { COPY } from '../../shared/copy';
import { LandingImage } from './LandingImage';
import { fadeUpOnEnter, gsap, unitOf, useLandingMotion } from './motion';

const CARDS = [
  { number: 'ON-12a', title: 'ON-13a', text: 'ON-14a', glyph: 'landing-glyph-mywork.svg' },
  { number: 'ON-12b', title: 'ON-13b', text: 'ON-14b', glyph: 'landing-glyph-remix.svg' },
  { number: 'ON-12c', title: 'ON-13c', text: 'ON-14c', glyph: 'landing-glyph-derive.svg' },
] as const;

/** Three ways to work(3330:206270). 제목·문단은 페이드업, 카드 3장은 차례로 나타난다. 카드는 링크가 아니라 마우스를 올릴 때만 반응한다. */
export function ThreeWaysSection() {
  const ref = useRef<HTMLElement>(null);
  const setup = useCallback((root: HTMLElement) => {
    for (const el of gsap.utils.toArray<HTMLElement>('[data-fade]', root)) fadeUpOnEnter(el, root);
    const cards = gsap.utils.toArray<HTMLElement>('[data-card]', root);
    gsap.from(cards, {
      opacity: 0,
      y: () => 48 * unitOf(root),
      duration: 0.8,
      ease: 'power2.out',
      stagger: 0.15,
      scrollTrigger: { trigger: cards[0], start: 'top 88%', once: true },
    });
  }, []);
  useLandingMotion(ref, setup);

  return (
    <section ref={ref} className="landing-ways" aria-labelledby="landing-ways-title">
      <div aria-hidden="true" className="landing-ways-bg" />
      <div data-fade className="landing-ways-head">
        <p className="landing-eyebrow">{COPY['ON-09']}</p>
        <h2 id="landing-ways-title" className="landing-heading">
          {COPY['ON-10a']}
          <br />
          {COPY['ON-10b']}
        </h2>
      </div>
      <p data-fade className="landing-body landing-ways-text">
        {COPY['ON-11']}
      </p>
      <ul className="landing-cards">
        {CARDS.map((card) => (
          <li key={card.title} data-card className="landing-card-slot">
            <article className="landing-card">
              <div aria-hidden="true" className="landing-card-glyph">
                <LandingImage file={card.glyph} loading="lazy" className="landing-fill" />
              </div>
              <p aria-hidden="true" className="landing-card-number">
                {COPY[card.number]}
              </p>
              <div className="landing-card-copy">
                <h3 className="landing-card-title">{COPY[card.title]}</h3>
                <p className="landing-card-text">{COPY[card.text]}</p>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
