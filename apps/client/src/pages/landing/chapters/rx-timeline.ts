/**
 * REMIX 연출 시간표. MY WORK 가 끝난 틀에서 이어서 시작한다.
 * Try Remix 말풍선 → 리믹스 버튼 클릭 → 크리에이터 고르기 → 노드 지도로 물러나기
 * → 다르게 판단할 자리에 커넥션 표시 → 한 커넥션으로 확대해 의견 배너 펼치기.
 * 모든 좌표는 기준안 좌표(1728×1117 기준)이고, 화면 크기에 따라 달라지는 값은 getGeo() 로 그때그때 읽는다.
 */
import { gsap, ScrollTrigger } from '../motion';
import { all, must } from './mw-dom';
import { mapFrame, type MwGeo, type Rect } from './mw-geo';
import { connectorPath, MAP_SCALE } from './nodes-layout';
import { MAP_ANSWER, MAP_ANSWER_START, MAP_START, mapLinks } from './rx-data';
import { APP_W, cursorClick, pinOptions, stretchRange, windowShadow } from './shared';

/** 틀(rect)을 앱 크기(1728 폭) 기준 transform 값으로 바꾼다 */
export const frameAt = (r: Rect) => ({ x: r.x, y: r.y, scale: r.w / APP_W });

/** 지도를 한 커넥션 쪽으로 확대했을 때의 지도 transform(화면 크기에 맞춘 값) */
export function zoomTarget(g: MwGeo) {
  const k4 = g.vw / 1920;
  const oy = Math.max(0, (g.vh - 1080 * k4) / 2);
  const b = g.bleed;
  return {
    x: (-697.13 * k4 - b.x) / b.s,
    y: (-556.94 * k4 + oy - b.y) / b.s,
    scale: (2.2274 * k4) / b.s,
  };
}

export function setupRemix(root: HTMLElement, getGeo: () => MwGeo): void {
  const M = getGeo;
  const stage = must(root, '.rx-stage');
  const app = must(stage, '.rx-app');
  const cursor = must(app, '.rx-app-cursor');
  const frame = must(stage, '.rx-frame');
  const map = must(app, '.rx-map');
  const q = (selector: string) => must(stage, selector);

  must(frame, '.rx-fbox').style.boxShadow = windowShadow(1);

  const tl = gsap.timeline({ scrollTrigger: pinOptions(stage, 16.6) });
  // 챕터에 들어와 있는 동안만 보인다(앞 챕터 위로 겹치는 자리라서)
  ScrollTrigger.create({
    trigger: root,
    start: 'top top',
    end: 'max',
    onToggle: (self) => {
      stage.style.visibility = self.isActive ? 'visible' : 'hidden';
    },
  });

  gsap.set([frame, map], { transformOrigin: '0 0', force3D: false });
  const bubble = q('.rx-bub');
  const home = q('.rx-s1l');
  const board = q('.rx-s3');
  const panel = q('.rx-s2p');
  const icons = q('.rx-s2i');
  const dimmed = all(app, '[data-dim]');
  const start = () => frameAt(M().end);
  const mapRect = () => mapFrame(M().vw, M().vh, M().hh);

  // 1. MY WORK 가 끝난 그 틀. "Try Remix!" 말풍선이 리믹스 버튼 위에서 통통 뛴다
  tl.fromTo(
    frame,
    { x: () => start().x, y: () => start().y, scale: () => start().scale },
    { x: () => start().x, y: () => start().y, scale: () => start().scale, duration: 0.01 },
    0,
  )
    .fromTo(
      bubble,
      { opacity: 0, scale: 0.4, transformOrigin: '62% 0%' },
      { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(3)' },
      0.2,
    )
    .to(bubble, { y: -12, duration: 0.16, yoyo: true, repeat: 5, ease: 'sine.inOut' }, 0.6);

  // 2. 리믹스 버튼을 누르면 크리에이터 목록이 열린다
  gsap.set(cursor, { x: 1350, y: 820, opacity: 0 });
  tl.to(cursor, { opacity: 1, duration: 0.15 }, 1.25).to(
    cursor,
    { x: 1684, y: 214, duration: 0.55, ease: 'power2.inOut' },
    1.3,
  );
  cursorClick(tl, cursor, 1.9);
  tl.to(bubble, { opacity: 0, scale: 0.85, duration: 0.2 }, 1.95)
    .to(icons, { opacity: 1, duration: 0.15 }, 1.95)
    .fromTo(
      panel,
      { opacity: 1, clipPath: 'inset(0% 0% 100% 0%)' },
      { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.5, ease: 'power3.out' },
      2.05,
    )
    .to(cursor, { x: 1392, y: 392, duration: 0.45, ease: 'power2.inOut' }, 2.7);
  cursorClick(tl, cursor, 3.2);
  tl.to(panel, { opacity: 0, y: -8, duration: 0.3 }, 3.35)
    .to(cursor, { opacity: 0, duration: 0.2 }, 3.35)
    // 3. 화면이 노드 지도 전체가 보이게 물러난다
    .to(
      frame,
      {
        x: () => frameAt(mapRect()).x,
        y: () => frameAt(mapRect()).y,
        scale: () => frameAt(mapRect()).scale,
        duration: 1.1,
        ease: 'expo.inOut',
      },
      3.55,
    )
    .to(q('.rx-title'), { opacity: 0, y: -30, duration: 0.5, ease: 'power2.in' }, 3.55)
    .to(home, { opacity: 0, duration: 0.25, ease: 'none' }, 3.5)
    .fromTo(board, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'none' }, 3.5)
    .fromTo(
      q('.rx-s3dim'),
      { opacity: 1 },
      { opacity: 0, duration: 0.8, ease: 'power1.inOut' },
      3.75,
    );

  // 노드가 MY WORK 크기에서 지도 크기로 줄어들고, 연결선은 노드의 연결점을 따라 다시 그려진다
  const nodes = all(map, '.rx-node'); // 프롬프트, 1~5단계 순서
  const answer = q('.rx-answer');
  const links = mapLinks();
  const paths = links.map((_, k) => must<SVGPathElement>(map, `.rx-link-${k}`));
  nodes.forEach((el, i) => {
    const [sx, sy] = MAP_START[i] ?? [0, 0];
    const x0 = parseFloat(el.style.left);
    const y0 = parseFloat(el.style.top);
    tl.fromTo(
      el,
      { x: sx - x0, y: sy - y0, scale: 1, transformOrigin: '0 0' },
      { x: 0, y: 0, scale: MAP_SCALE, duration: 1.2, ease: 'expo.inOut' },
      3.55 + (5 - i) * 0.025,
    );
  });
  const k = 1 / MAP_SCALE;
  tl.fromTo(
    answer,
    {
      x: MAP_ANSWER_START.x - MAP_ANSWER_START.dx * k - MAP_ANSWER.x,
      y: MAP_ANSWER_START.y - MAP_ANSWER_START.dy * k - MAP_ANSWER.y,
      scale: k,
      transformOrigin: '0 0',
    },
    { x: 0, y: 0, scale: 1, duration: 1.2, ease: 'expo.inOut' },
    3.55,
  );

  const owners = [...nodes, answer];
  const base = owners.map((el) => [parseFloat(el.style.left), parseFloat(el.style.top)] as const);
  /** 노드 i 의 지도 좌표 점(px,py)이 지금 어디에 있는지 */
  const follow = (i: number, px: number, py: number): [number, number] => {
    const el = owners[i];
    const origin = base[i];
    if (!el || !origin) return [px, py];
    const rel = Number(gsap.getProperty(el, 'scale')) / (el === answer ? 1 : MAP_SCALE);
    return [
      origin[0] + Number(gsap.getProperty(el, 'x')) + (px - origin[0]) * rel,
      origin[1] + Number(gsap.getProperty(el, 'y')) + (py - origin[1]) * rel,
    ];
  };
  const redraw = () => {
    links.forEach(([from, fx, fy, to, tx, ty], n) => {
      const [x1, y1] = follow(from, fx, fy);
      const [x2, y2] = follow(to, tx, ty);
      paths[n]?.setAttribute('d', connectorPath(x1, y1, x2, y2));
    });
  };
  tl.eventCallback('onUpdate', redraw);
  redraw();
  requestAnimationFrame(redraw);

  // 4. 다르게 판단했을 노드에 커넥션 표시가 뜨고, 나머지는 물러선다
  tl.fromTo(
    all(app, '.rx-cn'),
    { opacity: 0, scale: 0.2 },
    {
      opacity: 1,
      scale: 1,
      duration: 0.6,
      ease: 'back.out(3)',
      stagger: 0.55,
      transformOrigin: '50% 50%',
    },
    5.0,
  );
  for (const el of dimmed) {
    tl.fromTo(
      el,
      { opacity: 1 },
      { opacity: Number(el.dataset.dim ?? 0.65), duration: 0.9, ease: 'power1.inOut' },
      4.85,
    );
  }

  // 5. 한 커넥션으로 확대해서 의견 배너를 연다
  const firstMarker = q('.rx-cn-1');
  tl.to(
    frame,
    {
      x: () => frameAt(M().bleed).x,
      y: () => frameAt(M().bleed).y,
      scale: () => frameAt(M().bleed).scale,
      duration: 1.3,
      ease: 'expo.inOut',
    },
    5.9,
  )
    .to(
      map,
      {
        x: () => zoomTarget(M()).x,
        y: () => zoomTarget(M()).y,
        scale: () => zoomTarget(M()).scale,
        duration: 1.3,
        ease: 'expo.inOut',
      },
      5.9,
    )
    .to(all(app, '.rx-s3c, .rx-s3bg'), { opacity: 0, duration: 0.5 }, 5.95)
    .fromTo(q('.rx-fade'), { opacity: 0 }, { opacity: 1, duration: 0.5 }, 6.7)
    .fromTo(
      q('.rx-heading'),
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' },
      6.8,
    )
    .to(
      firstMarker,
      { scale: 1.3, duration: 0.15, yoyo: true, repeat: 1, transformOrigin: '50% 50%' },
      7.4,
    )
    .to(firstMarker, { opacity: 0, duration: 0.15 }, 7.7)
    .fromTo(
      q('.rx-ban'),
      { opacity: 1, clipPath: 'inset(0% 0% 0% 100%)' },
      { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.6, ease: 'expo.out' },
      7.7,
    )
    .to({}, { duration: 0.3 }, 8.3);

  tl.shiftChildren(1.0, false, 5.89); // 커넥션 세 개가 다 뜬 뒤에 확대한다
  stretchRange(tl, 6.9, 9.6, 1.35); // 확대와 배너 펼침은 조금 천천히
}
