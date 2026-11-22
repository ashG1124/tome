import { useRef, type MutableRefObject } from 'react';
import { COPY } from '../../../shared/copy';
import { gsap, ScrollTrigger } from '../motion';
import { Shot, StoryTitle, TryRemixButton } from './storyParts';
import { createChapterTimeline, useStoryChapter } from './storyMotion';

const DURATION = 11;
/** 타임라인 위치: 말풍선이 보이는 구간, Remix with 패널이 열려 있는 구간 */
const BUBBLE_SHOWN = { from: 1.6, to: 3.2 };
const PANEL_OPEN = 5.2;

/** 장 바깥(버튼)에서 스크롤 위치를 정하기 위한 손잡이 */
export interface RemixControl {
  /** 말풍선이 보이는 구간으로 스크롤(이미 그 구간이면 가만히) */
  showBubble: () => void;
  /** Remix with 패널이 열린 구간으로 스크롤 */
  goToPanel: (smooth: boolean) => void;
}

/** 확대 때 중심이 되는 곳: Evidence Extraction 항목 근처(앱 화면 이미지 안 비율) */
const ZOOM_ORIGIN = { g: '43.5% 51.3%' };
const G_ZOOM = 2.6;

/**
 * 2장 REMIX. 창 프레임 + 말풍선(통통 튀는 강조) → 누르면 Remix with 패널이 위에서 내려옴 →
 * 노드 전체 축소 보기 → Evidence Extraction 근처를 중심으로 확대되어 노드 화면 H 로 이어진다.
 */
export function RemixChapter({
  controlRef,
}: {
  controlRef: MutableRefObject<RemixControl | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useStoryChapter(ref, ({ q, one, stage, unit }) => {
    const tl = createChapterTimeline(
      { root: ref.current as HTMLElement, stage, unit, q, one },
      DURATION,
    );
    const u = (n: number) => () => n * unit();
    const shot = (id: string) => one(`[data-shot="${id}"]`);
    const winE = one('[data-win-e]');
    const bubble = one('[data-story-bubble]');
    const bob = one('[data-bubble-bob]');
    const title = one('[data-story-title]');
    const panel = shot('frameF');
    const winG = one('[data-win-g]');
    const screenH = one('[data-screen-h]');
    const hTitle = one('[data-h-title]');

    gsap.set([winE, bubble, panel, winG, screenH, hTitle], { opacity: 0 });
    gsap.set(winE, { y: u(40) });
    gsap.set(bubble, { scale: 0.6 });
    gsap.set(panel, { y: u(-28) });
    gsap.set(winG, { transformOrigin: ZOOM_ORIGIN.g });

    tl.to(winE, { opacity: 1, y: 0, ease: 'power2.out', duration: 1 }, 0.2)
      .to(bubble, { opacity: 1, scale: 1, ease: 'back.out(2)', duration: 0.6 }, 1)
      // 사용자가 클릭하면! — 말풍선이 눌렸다 사라지고, Remix with 패널이 위에서 살짝 내려온다
      .to(bubble, { scale: 0.9, duration: 0.25 }, 3.2)
      .to(bubble, { opacity: 0, duration: 0.4 }, 3.5)
      .to(panel, { opacity: 1, y: 0, ease: 'power2.out', duration: 1 }, 3.6)
      // 노드 전체 축소 보기: 앞 화면이 완전히 사라진 뒤 G 가 나타난다(fade-through)
      .to(winE, { opacity: 0, duration: 0.6 }, 6)
      .to(winG, { opacity: 1, duration: 0.6 }, 6.6)
      .to(title, { opacity: 0, duration: 0.6 }, 7.2)
      // 확대: Evidence Extraction 근처를 중심으로 G 가 커지며 사라지고, H 는 이미 확대된 크기로 짧게 나타난다
      .to(winG, { scale: G_ZOOM, ease: 'power2.in', duration: 1.6 }, 7.4)
      .to(winG, { opacity: 0, duration: 0.7 }, 8.3)
      .to(screenH, { opacity: 1, duration: 0.6 }, 9)
      .to(hTitle, { opacity: 1, duration: 0.6 }, 9.6);

    // 말풍선 통통 튀기: scale·y 반복(yoyo). 장이 화면에 있을 때만 돈다.
    const bounce = gsap.to(bob, {
      y: u(-9),
      scale: 1.08,
      duration: 0.42,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
      paused: true,
    });
    const visible = ScrollTrigger.create({
      trigger: stage,
      start: 'top bottom',
      end: 'bottom top',
      onToggle: (self) => bounce.paused(!self.isActive),
    });

    const trigger = tl.scrollTrigger as ScrollTrigger;
    const at = (time: number) => trigger.start + (trigger.end - trigger.start) * (time / DURATION);
    controlRef.current = {
      showBubble: () => {
        const y = window.scrollY;
        if (y >= at(BUBBLE_SHOWN.from) && y <= at(BUBBLE_SHOWN.to)) return;
        window.scrollTo(0, Math.round(at((BUBBLE_SHOWN.from + BUBBLE_SHOWN.to) / 2)));
      },
      goToPanel: (smooth) =>
        window.scrollTo({ top: Math.round(at(PANEL_OPEN)), behavior: smooth ? 'smooth' : 'auto' }),
    };
    return () => {
      controlRef.current = null;
      visible.kill();
      bounce.kill();
    };
  });

  return (
    <div ref={ref} className="story-chapter" data-chapter="remix">
      <div data-stage className="story-stage">
        <div className="story-canvas">
          <StoryTitle id="remix" />
          <div data-win-e className="story-win story-win-wide">
            <Shot id="frameE" />
            <div className="story-clip-panel">
              <Shot id="frameF" />
            </div>
            <div className="story-bubble-pos">
              <TryRemixButton
                onPress={() => controlRef.current?.goToPanel(true)}
                onFocus={() => controlRef.current?.showBubble()}
              />
            </div>
          </div>
          <div data-win-g className="story-win story-win-wide">
            <Shot id="frameG" />
          </div>
          <div data-screen-h className="story-screen">
            <div data-h className="story-h">
              <Shot id="nodesH" className="story-node" />
            </div>
            <p data-h-title className="story-h-title">
              {COPY['ON-29']}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
