import { useCallback, useRef } from 'react';
import { COPY } from '../../shared/copy';
import { fadeUpOnEnter, gsap, useLandingMotion } from './motion';

/** Our Vision(3445:27283·3445:27346): 제목과 본문이 화면에 들어올 때 페이드업 */
export function VisionSection() {
  const ref = useRef<HTMLElement>(null);
  const setup = useCallback((root: HTMLElement) => {
    for (const el of gsap.utils.toArray<HTMLElement>('[data-fade]', root)) fadeUpOnEnter(el, root);
  }, []);
  useLandingMotion(ref, setup);

  return (
    <section ref={ref} className="landing-vision" aria-labelledby="landing-vision-title">
      <div data-fade className="landing-vision-head">
        <p className="landing-eyebrow">{COPY['ON-05']}</p>
        <h2 id="landing-vision-title" className="landing-heading">
          {COPY['ON-06a']}
          <br />
          {COPY['ON-06b']}
        </h2>
      </div>
      <div data-fade className="landing-vision-body">
        <p className="landing-body">{COPY['ON-07a']}</p>
        <p className="landing-body">
          {COPY['ON-07b']}
          <br />
          {COPY['ON-07c']}
        </p>
      </div>
    </section>
  );
}
