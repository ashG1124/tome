import { useLayoutEffect, useRef } from 'react';
import { COPY } from '../../../shared/copy';
import { gsap, ScrollTrigger } from '../motion';
import type { ChapterProps } from './ChapterProps';
import { AgoraRows, ProjectCard } from './dv-cards';
import { HERO_INDEX, MY_BOX, SHOT_BOX } from './dv-data';
import { applyGeo, computeGeo } from './dv-layout';
import { NodeMap } from './dv-map';
import { DeriveEyebrow, DeriveTitle, DotTail, Shot } from './dv-parts';
import { DeriveStill } from './dv-still';
import { buildTimeline } from './dv-timeline';
import './derive.css';

/** 점무늬 띠가 고정 화면의 점무늬와 이어지도록 세로 위치를 맞춘다 */
const DOT_STEP = 15.6;

/** 스크롤 연출 버전: 한 화면을 고정하고 아고라 → 줌 → 노드 지도 → 파생 순서로 재생한다 */
function DeriveStory() {
  const stageRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let geo = computeGeo(window.innerWidth, window.innerHeight);
    const layout = () => {
      applyGeo(stage, geo);
      if (tailRef.current) {
        tailRef.current.style.backgroundPosition = `0 ${-(stage.offsetHeight % DOT_STEP)}px`;
      }
    };
    layout();
    const ctx = gsap.context(() => {
      buildTimeline(stage, () => geo);
    }, stage);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        geo = computeGeo(window.innerWidth, window.innerHeight);
        layout();
        ScrollTrigger.refresh();
      }, 120);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(timer);
      ctx.revert();
    };
  }, []);

  return (
    <>
      <section
        id="derive"
        data-chapter="derive"
        className="landing-chapter dv"
        aria-labelledby="dv-title"
      >
        <div ref={stageRef} className="dv-stage">
          <div className="dv-bg" aria-hidden="true" />
          <div className="dv-b">
            <div className="dv-h">
              <DeriveEyebrow />
              <DeriveTitle />
            </div>
            <AgoraRows />
          </div>
          <div className="dv-m" aria-hidden="true">
            <div className="dv-w">
              <NodeMap />
              <svg className="dv-l5" width="177" height="281" viewBox="0 0 177 281" fill="none">
                <path d="M176.2 280.3C54.2 280.3 159.7 0 0 0" />
              </svg>
              <svg className="dv-ln" width="332" height="660" viewBox="0 0 332 660" fill="none">
                <path d="M0 0C159.7 0 -37.8 659.6 331.5 659.6" />
              </svg>
              <Shot file="dv_sha" box={SHOT_BOX} className="dv-sha" />
              <Shot file="dv_shf" box={SHOT_BOX} className="dv-shf" />
              <i className="dv-dot" />
              <div className="dv-lab">{COPY['ON-38']}</div>
              <Shot file="dv_my" box={MY_BOX} className="dv-my" />
            </div>
          </div>
          <div className="dv-fade" aria-hidden="true" />
          <div className="dv-t">
            <h3 className="dv-t1">{COPY['ON-33a']}</h3>
            <h3 className="dv-t2">{COPY['ON-33b']}</h3>
          </div>
          <div className="dv-z" aria-hidden="true">
            <ProjectCard index={HERO_INDEX} />
          </div>
        </div>
      </section>
      <DotTail ref={tailRef} />
    </>
  );
}

export function DeriveChapter({ motion }: ChapterProps) {
  return motion ? <DeriveStory /> : <DeriveStill />;
}
