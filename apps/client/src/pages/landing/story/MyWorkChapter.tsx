import { useRef } from 'react';
import { COPY } from '../../../shared/copy';
import { gsap } from '../motion';
import { Shot, StoryTitle } from './storyParts';
import { createChapterTimeline, useStoryChapter } from './storyMotion';

/** 타임라인 길이(단위). 아래 숫자는 모두 이 길이 안의 위치다. */
const DURATION = 13.4;
/** 창 프레임이 화면 가득 커질 때 배율(창 안쪽 폭 → 화면 폭) */
const WINDOW_ZOOM = 1.7;
/** 창 가운데가 화면 가운데로 오는 데 필요한 위로 이동(디자인 단위) */
const WINDOW_LIFT = 138;

/**
 * 1장 MY WORK. 홈 → 워크스페이스 진입 → 프레임이 사라지며 확대 → 노드 화면 A →(오른쪽 이동) B →
 * 답변 쌓임 C → 메뉴바 D → 축소되며 창 프레임으로 돌아간다.
 */
export function MyWorkChapter() {
  const ref = useRef<HTMLDivElement>(null);

  useStoryChapter(ref, ({ q, one, stage, unit }) => {
    const tl = createChapterTimeline(
      { root: ref.current as HTMLElement, stage, unit, q, one },
      DURATION,
    );
    const u = (n: number) => () => n * unit();
    const shot = (id: string) => one(`[data-shot="${id}"]`);
    const win = one('[data-win]');
    const screen = one('[data-screen]');
    const title = one('[data-story-title]');
    const labelA = one('[data-label="a"]');
    const labelB = one('[data-label="b"]');
    const pan = one('[data-pan]');
    const menu = shot('nodesD');
    const yellow = one('[data-bg-yellow]');

    gsap.set([shot('entry'), shot('zoomout'), shot('nodesC'), menu, screen, labelA, labelB], {
      opacity: 0,
    });
    gsap.set(shot('nodesC'), { y: u(14), scale: 0.985, transformOrigin: '60% 80%' });
    gsap.set(menu, { x: u(70) });
    gsap.set(labelA, { y: u(12) });
    gsap.set(labelB, { y: u(12) });

    // 홈 → 같은 프레임 안에서 워크스페이스 진입 화면(앞 화면이 사라진 뒤 다음이 나타남)
    tl.to(shot('home'), { opacity: 0, duration: 0.5 }, 0.9)
      .to(shot('entry'), { opacity: 1, duration: 0.5 }, 1.4)
      // 제목이 사라지고, 창 테두리·신호등이 화면 밖으로 밀려나며 워크스페이스가 화면 가득 커진다
      .to(title, { opacity: 0, y: u(-40), duration: 1.1 }, 2.3)
      .to(yellow, { opacity: 0, duration: 1.6 }, 2.3)
      .to(win, { scale: WINDOW_ZOOM, y: u(-WINDOW_LIFT), ease: 'power1.inOut', duration: 1.7 }, 2.3)
      // 노드 화면 A 로: 워크스페이스가 커지며 완전히 사라진 뒤 A 가 나타난다(fade-through, 두 화면이 겹치지 않음)
      .to(shot('entry'), { opacity: 0, duration: 0.5 }, 3.6)
      .to(screen, { opacity: 1, duration: 0.6 }, 4.1)
      .to(labelA, { opacity: 1, y: 0, duration: 0.7 }, 4.5)
      // 우측으로 카메라 이동: A → B (두 화면을 가로로 이어 놓고 옮긴다)
      .to(labelA, { opacity: 0, y: u(-12), duration: 0.5 }, 5.3)
      .to(pan, { x: () => -1920 * unit(), ease: 'power2.inOut', duration: 1.6 }, 5.3)
      .to(labelB, { opacity: 1, y: 0, duration: 0.7 }, 6.5)
      // 답변 쌓기: B → C (카드 묶음이 살짝 위로 쌓이는 느낌)
      .to(shot('nodesC'), { opacity: 1, y: 0, scale: 1, ease: 'power2.out', duration: 1.1 }, 7.6)
      // 메뉴바: D 를 C 위에 겹쳐 오른쪽에서 들어오게(메뉴바 영역만 보이는 틀 안에서)
      .to(menu, { opacity: 1, x: 0, ease: 'power2.out', duration: 1 }, 9.1)
      // 화면이 축소되면서 사라진 뒤, 창 프레임이 다시 생긴다(fade-through)
      .to(labelB, { opacity: 0, duration: 0.5 }, 10.6)
      .to(
        screen,
        { scale: 1 / WINDOW_ZOOM, y: u(WINDOW_LIFT), opacity: 0, ease: 'power1.in', duration: 1.1 },
        10.8,
      )
      .to(win, { scale: 1, y: 0, ease: 'power1.inOut', duration: 1.6 }, 11.3)
      .to(shot('zoomout'), { opacity: 1, duration: 0.8 }, 11.9);
  });

  return (
    <div ref={ref} className="story-chapter" data-chapter="mywork">
      <div data-stage className="story-stage">
        <div aria-hidden="true" data-bg-yellow className="story-bg-yellow" />
        <div className="story-canvas">
          <StoryTitle id="mywork" subtitle="ON-24" />
          <div data-win className="story-win">
            <Shot id="home" />
            <Shot id="entry" />
            <Shot id="zoomout" />
          </div>
          <div data-screen className="story-screen">
            <div data-pan className="story-pan">
              <Shot id="nodesA" className="story-node story-node-a" />
              <Shot id="nodesB" className="story-node story-node-b" />
            </div>
            <Shot id="nodesC" className="story-node" />
            <div className="story-clip-menu">
              <Shot id="nodesD" className="story-node" />
            </div>
            <div data-label="a" className="story-label">
              <p className="story-label-text">{COPY['ON-25']}</p>
            </div>
            <div data-label="b" className="story-label">
              <p className="story-label-text">{COPY['ON-26']}</p>
              <p className="story-label-sub">{COPY['ON-27']}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
