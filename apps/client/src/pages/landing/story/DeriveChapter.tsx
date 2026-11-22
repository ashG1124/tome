import { useRef } from 'react';
import { gsap, ScrollTrigger } from '../motion';
import { RollingBands } from './RollingBands';
import { Shot, StoryTitle } from './storyParts';
import { createChapterTimeline, useStoryChapter } from './storyMotion';

const DURATION = 9;
/** 띠 → Project Preview 확대 구간(타임라인 위치) */
const ZOOM = { from: 1.6, to: 3.6 };
/** Preview 그림(1776×1424) 안 카드 본체의 위치·크기 비율: 왼쪽 88, 위 70, 폭 1599, 높이 1248 */
const PREVIEW_CARD = { left: 88 / 1776, top: 70 / 1424, width: 1599 / 1776, height: 1248 / 1424 };
/** 줄 한 바퀴(−50% 이동)에 걸리는 시간(초). 줄마다 다르고 가운데 줄은 반대 방향이다. */
const ROW_SECONDS = { projects: 70, creators: 90, topics: 55 } as const;
type RowKind = keyof typeof ROW_SECONDS;

/** 같은 목록이 두 번 이어진 줄 중 지금 화면 가운데에 가까운 Sound armor 카드 */
function pickCard(root: HTMLElement): HTMLElement | null {
  const cards = [...root.querySelectorAll<HTMLElement>('[data-roll-card="sound-armor"]')];
  const mid = window.innerWidth / 2;
  const dist = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return Math.abs(r.left + r.width / 2 - mid);
  };
  return cards.sort((a, b) => dist(a) - dist(b))[0] ?? null;
}

/**
 * 3장 DERIVE. 롤링 띠 3줄(끝없이 흐름, 마우스를 올린 줄은 멈춤) → Sound armor 카드가 띠에서 떠올라
 * Project Preview 크기로 커짐(FLIP: 확대가 시작되는 순간의 카드 위치를 읽어 계산, 확대 구간엔 띠 정지) →
 * 노드 화면(shina's answer)이 아래에서 떠오르고 My answer 가지가 추가된 화면으로 바뀐다.
 */
export function DeriveChapter() {
  const ref = useRef<HTMLDivElement>(null);

  useStoryChapter(ref, ({ q, one, stage, unit }) => {
    const root = ref.current as HTMLElement;
    const tl = createChapterTimeline({ root, stage, unit, q, one }, DURATION);
    const u = (n: number) => () => n * unit();
    const shot = (id: string) => one(`[data-shot="${id}"]`);
    const title = one('[data-story-title]');
    const bands = one('.story-bands');
    const preview = one('[data-preview]');
    const previewFade = one('[data-preview-fade]');
    const nodesA = shot('remixA');
    const nodesB = shot('remixB');

    gsap.set([preview, nodesA, nodesB], { opacity: 0 });
    gsap.set(nodesA, { y: u(140) });

    // --- 롤링: 줄마다 -50% 를 반복 이동. 가운데 줄은 반대 방향 ---
    const state = { visible: true, zooming: false };
    const hover: Record<string, boolean> = {};
    const tweens = new Map<RowKind, gsap.core.Tween>();
    const cleanups: Array<() => void> = [];
    for (const row of q<HTMLElement>('[data-roll-row]')) {
      const kind = row.dataset.rollRow as RowKind;
      const track = row.querySelector<HTMLElement>('[data-roll-track]');
      if (!track) continue;
      const reverse = kind === 'creators';
      const tween = gsap.fromTo(
        track,
        { xPercent: reverse ? -50 : 0 },
        {
          xPercent: reverse ? 0 : -50,
          duration: ROW_SECONDS[kind],
          ease: 'none',
          repeat: -1,
        },
      );
      tweens.set(kind, tween);
      const enter = () => {
        hover[kind] = true;
        sync();
      };
      const leave = () => {
        hover[kind] = false;
        sync();
      };
      row.addEventListener('mouseenter', enter);
      row.addEventListener('mouseleave', leave);
      cleanups.push(() => {
        row.removeEventListener('mouseenter', enter);
        row.removeEventListener('mouseleave', leave);
      });
    }
    function sync() {
      for (const [kind, tween] of tweens) {
        tween.paused(!state.visible || state.zooming || hover[kind] === true);
      }
    }
    const visible = ScrollTrigger.create({
      trigger: stage,
      start: 'top bottom',
      end: 'bottom top',
      onToggle: (self) => {
        state.visible = self.isActive;
        sync();
      },
    });

    // --- 확대(FLIP): 시작 순간의 카드 위치·크기를 읽어 Preview 의 최종 자리로 ---
    let zoomTl: gsap.core.Timeline | null = null;
    const progress = { p: 0 };
    const resetZoom = () => {
      zoomTl?.kill();
      zoomTl = null;
      gsap.set(preview, { clearProps: 'transform' });
      gsap.set(preview, { opacity: 0 });
    };
    const startZoom = () => {
      const card = pickCard(root);
      if (!card) return;
      gsap.set(preview, { clearProps: 'transform' });
      const to = preview.getBoundingClientRect();
      const from = card.getBoundingClientRect();
      // Preview 그림 안에서 카드 본체가 차지하는 칸(그림자 여백 제외)
      const inner = {
        cx: to.left + to.width * (PREVIEW_CARD.left + PREVIEW_CARD.width / 2),
        cy: to.top + to.height * (PREVIEW_CARD.top + PREVIEW_CARD.height / 2),
        w: to.width * PREVIEW_CARD.width,
      };
      const scale = inner.w === 0 ? 1 : from.width / inner.w;
      const centerX = to.left + to.width / 2;
      const centerY = to.top + to.height / 2;
      zoomTl = gsap.timeline({ paused: true }).fromTo(
        preview,
        {
          x: from.left + from.width / 2 - (centerX + scale * (inner.cx - centerX)),
          y: from.top + from.height / 2 - (centerY + scale * (inner.cy - centerY)),
          scale,
          opacity: 1,
        },
        { x: 0, y: 0, scale: 1, opacity: 1, ease: 'power2.inOut', duration: 1 },
      );
    };
    tl.to(
      progress,
      {
        p: 1,
        duration: ZOOM.to - ZOOM.from,
        onUpdate: () => {
          if (progress.p > 0 && !state.zooming) {
            state.zooming = true;
            sync();
            startZoom();
          }
          zoomTl?.progress(progress.p);
        },
        onReverseComplete: () => {
          state.zooming = false;
          sync();
          resetZoom();
        },
      },
      ZOOM.from,
    )
      .to(bands, { opacity: 0, duration: 0.8 }, ZOOM.from + 0.9)
      // 노드 띄워주기: Preview 가 위로·작게 빠져 완전히 사라진 뒤, 노드 화면이 아래에서 떠오른다
      .to(previewFade, { opacity: 0, y: u(-60), scale: 0.92, duration: 0.7 }, 4.2)
      .to(title, { opacity: 0, duration: 0.7 }, 4.2)
      .to(nodesA, { opacity: 1, y: 0, ease: 'power2.out', duration: 1.3 }, 5)
      // My answer 가지가 추가된 화면으로
      .to(nodesB, { opacity: 1, duration: 1.1 }, 6.9);

    return () => {
      visible.kill();
      zoomTl?.kill();
      for (const tween of tweens.values()) tween.kill();
      for (const cleanup of cleanups) cleanup();
    };
  });

  return (
    <div ref={ref} className="story-chapter" data-chapter="derive">
      <div data-stage className="story-stage">
        <div className="story-canvas">
          <StoryTitle id="derive" />
          <RollingBands loop />
          <Shot id="remixA" className="story-node story-node-remix" />
          <Shot id="remixB" className="story-node story-node-remix" />
          <div data-preview className="story-preview">
            <div data-preview-fade className="story-preview-fade">
              <Shot id="preview" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
