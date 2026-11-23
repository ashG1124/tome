import { useLayoutEffect, useRef } from 'react';
import { COPY } from '../../../shared/copy';
import { LandingImage } from '../LandingImage';
import { gsap, ScrollTrigger } from '../motion';
import type { ChapterProps } from './ChapterProps';
import { computeGeo, type MwGeo } from './mw-geo';
import { placeTitle } from './mw-layout';
import { Eyebrow } from './mw-parts';
import { RxApp, RxBubble } from './rx-scene';
import { setupRemix } from './rx-timeline';
import { ob } from './shared';
import './mywork.css';
import './remix.css';

const RESIZE_DELAY_MS = 120;

function readSize(root: HTMLElement): [number, number] {
  const stage = root.querySelector<HTMLElement>('.rx-stage');
  return [stage?.clientWidth || window.innerWidth, window.innerHeight];
}

/** 창 크기에 따라 달라지는 자리(제목·확대 후 제목·가림막)를 맞춘다 */
function applyRxLayout(root: HTMLElement, g: MwGeo): void {
  const title = root.querySelector<HTMLElement>('.rx-title');
  if (title) placeTitle(title, g.end.tTop, g);
  const heading = root.querySelector<HTMLElement>('.rx-heading');
  if (heading) {
    heading.style.top = `${Math.max(g.hh + 18, (89 * g.vw) / 1920)}px`;
    const h3 = heading.querySelector<HTMLElement>('h3');
    if (h3) h3.style.fontSize = `${g.titleCap}px`;
  }
  const fade = root.querySelector<HTMLElement>('.rx-fade');
  if (fade) fade.style.height = `${g.hh + g.vh * 0.26}px`;
}

/** 움직임을 켠 REMIX: 한 화면을 고정(pin)하고 스크롤로 시간표를 재생한다 */
function MotionRemix() {
  const rootRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const [vw, vh] = readSize(root);
    let geo: MwGeo = computeGeo(vw, vh);
    let timer = 0;

    const ctx = gsap.context(() => {
      applyRxLayout(root, geo);
      setupRemix(root, () => geo);
    }, root);

    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const [w, h] = readSize(root);
        geo = computeGeo(w, h);
        applyRxLayout(root, geo);
        ScrollTrigger.refresh();
      }, RESIZE_DELAY_MS);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      ctx.revert();
    };
  }, []);

  return (
    <section
      ref={rootRef}
      id="remix"
      data-chapter="remix"
      className="landing-chapter rx-chapter rx-chapter--motion"
      aria-labelledby="remix-title"
    >
      <div className="rx-stage">
        <div className="rx-title">
          <Eyebrow word={COPY['ON-23b']} kind="remix" />
          <h2 id="remix-title">{COPY['ON-31']}</h2>
        </div>
        <div className="rx-frame" role="img" aria-label={COPY['ON-39']}>
          <div className="rx-fbox">
            <RxApp />
          </div>
          <RxBubble />
        </div>
        <div className="rx-fade" aria-hidden="true" />
        <div className="rx-heading">
          <h3>{COPY['ON-29']}</h3>
        </div>
      </div>
    </section>
  );
}

/** 움직임을 줄인 REMIX: 제목·한 줄 설명·틀 안 화면 한 장 */
function StillRemix() {
  return (
    <section
      id="remix"
      data-chapter="remix"
      className="landing-chapter rx-chapter mw-still"
      aria-labelledby="remix-title"
    >
      <div className="mw-still-head">
        <Eyebrow word={COPY['ON-23b']} kind="remix" />
        <h2 id="remix-title">{COPY['ON-31']}</h2>
        <p className="rx-still-sub">{COPY['ON-29']}</p>
      </div>
      <div className="mw-still-frame" role="img" aria-label={COPY['ON-39']}>
        <LandingImage file={ob('rx2_s1')} loading="lazy" />
      </div>
    </section>
  );
}

export function RemixChapter({ motion }: ChapterProps) {
  return motion ? <MotionRemix /> : <StillRemix />;
}
