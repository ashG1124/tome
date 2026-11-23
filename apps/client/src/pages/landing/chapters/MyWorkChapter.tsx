import { useEffect, useLayoutEffect, useRef } from 'react';
import { COPY } from '../../../shared/copy';
import { LandingImage } from '../LandingImage';
import { gsap, ScrollTrigger } from '../motion';
import type { ChapterProps } from './ChapterProps';
import { computeGeo, type MwGeo } from './mw-geo';
import { applyMwLayout } from './mw-layout';
import { Cursor, Eyebrow } from './mw-parts';
import { MwApp, MwBezel, MwCanvas, MwCaptions, MwComposer, MwIconMenu } from './mw-scene';
import { setupMyWork } from './mw-timeline';
import { ob } from './shared';
import './mywork.css';

export interface MyWorkChapterProps extends ChapterProps {
  /** 챕터가 화면을 가득 채우는 동안 헤더 배경을 투명하게 둘지 알린다 */
  onHeaderClear?: (clear: boolean) => void;
}

const RESIZE_DELAY_MS = 120;

function readSize(root: HTMLElement): [number, number] {
  const stage = root.querySelector<HTMLElement>('.mw-stage');
  return [stage?.clientWidth || window.innerWidth, window.innerHeight];
}

/** 움직임을 켠 MY WORK: 한 화면을 고정(pin)하고 스크롤로 시간표를 재생한다 */
function MotionMyWork({ onHeaderClear }: { onHeaderClear?: (clear: boolean) => void }) {
  const rootRef = useRef<HTMLElement>(null);
  const clearRef = useRef(onHeaderClear);
  useEffect(() => {
    clearRef.current = onHeaderClear;
  }, [onHeaderClear]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const [vw, vh] = readSize(root);
    let geo: MwGeo = computeGeo(vw, vh);
    let timer = 0;
    let api: ReturnType<typeof setupMyWork> | undefined;

    const ctx = gsap.context(() => {
      applyMwLayout(root, geo);
      api = setupMyWork(
        root,
        () => geo,
        (clear) => clearRef.current?.(clear),
      );
    }, root);

    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const [w, h] = readSize(root);
        geo = computeGeo(w, h);
        applyMwLayout(root, geo);
        api?.resetTyping();
        ScrollTrigger.refresh();
      }, RESIZE_DELAY_MS);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      ctx.revert();
      clearRef.current?.(false);
    };
  }, []);

  return (
    <section
      ref={rootRef}
      id="mywork"
      data-chapter="mywork"
      className="landing-chapter mw-chapter"
      aria-labelledby="mywork-title"
    >
      <div className="mw-stage">
        <div className="mw-title mw-title--start">
          <Eyebrow word={COPY['ON-23a']} kind="mywork" />
          <h2 id="mywork-title">{COPY['ON-24']}</h2>
        </div>
        <div className="mw-title mw-title--remix" aria-hidden="true">
          <Eyebrow word={COPY['ON-23b']} kind="remix" />
          <h2>{COPY['ON-31']}</h2>
        </div>
        <div className="mw-frame" role="img" aria-label={COPY['ON-39']}>
          <div className="mw-fbox">
            <MwApp />
          </div>
        </div>
        <div className="mw-ws" aria-hidden="true">
          <MwCanvas />
          <div className="mw-vig" />
          <div className="mw-tfade" />
        </div>
        <MwBezel />
        <MwIconMenu />
        <MwCaptions />
        <MwComposer />
        <Cursor className="mw-wcur" />
      </div>
    </section>
  );
}

/** 움직임을 줄인 MY WORK: 제목과 틀 안 화면 한 장 */
function StillMyWork() {
  return (
    <section
      id="mywork"
      data-chapter="mywork"
      className="landing-chapter mw-chapter mw-still"
      aria-labelledby="mywork-title"
    >
      <div className="mw-still-head">
        <Eyebrow word={COPY['ON-23a']} kind="mywork" />
        <h2 id="mywork-title">{COPY['ON-24']}</h2>
      </div>
      <div className="mw-still-frame" role="img" aria-label={COPY['ON-39']}>
        <LandingImage file={ob('mw_home2')} loading="lazy" />
      </div>
    </section>
  );
}

export function MyWorkChapter({ motion, onHeaderClear }: MyWorkChapterProps & ChapterProps) {
  return motion ? <MotionMyWork onHeaderClear={onHeaderClear} /> : <StillMyWork />;
}
