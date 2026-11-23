/**
 * MY WORK 연출 시간표 뒷부분: 노드 컨트롤 → 카메라 이동(2~5단계) → 답변 쌓기 → REMIX 틀로 돌아가기.
 * 앞부분(mw-timeline)이 만든 도구를 받아서 같은 타임라인에 이어 붙인다.
 * 모든 좌표는 기준안 좌표(1728×1117 기준)다.
 */
import { gsap } from '../motion';
import { must } from './mw-dom';
import type { MwCtx } from './mw-ctx';
import { cursorClick, wipeRight } from './shared';

export function buildNodeFlow(c: MwCtx): void {
  const { tl, stage, canvas, caps, wc, fbi, bz, M, q, spot, swap, pop, focus, rectTo } = c;
  // 8. 노드 컨트롤: 키워드를 열고, 점을 옮기고, 이유를 남긴다
  swap(0, 1, 9.9);
  tl.to(
    canvas,
    { x: () => M().txNode, y: () => M().tyEdit, duration: 0.8, ease: 'power2.inOut' },
    10.0,
  )
    .to(q('.mw-tfade'), { opacity: 1, duration: 0.4 }, 10.0)
    .set(wc, { x: () => M().vw * 0.66, y: () => M().vh * 0.92 }, 10.5)
    .to(wc, { opacity: 1, duration: 0.2 }, 10.6)
    .to(
      wc,
      {
        x: () => spot(860, 495).x,
        y: () => spot(860, 495).y,
        duration: 0.55,
        ease: 'power2.inOut',
      },
      10.65,
    );
  cursorClick(tl, wc, 11.25);
  const s1o = q('.mw-s1o');
  tl.set(s1o, { opacity: 1 }, 11.35)
    .fromTo(
      s1o,
      { clipPath: 'inset(0px 0px 422px 0px)' },
      { clipPath: 'inset(0px 0px 0px 0px)', duration: 0.55, ease: 'power3.out' },
      11.35,
    )
    .to(
      wc,
      {
        x: () => spot(799, 665).x,
        y: () => spot(799, 665).y,
        duration: 0.45,
        ease: 'power2.inOut',
      },
      11.95,
    );
  cursorClick(tl, wc, 12.45);
  const dot = q('.mw-dot');
  const field = must(stage, '.mw-plot-field');
  tl.set([q('.mw-plot'), dot], { opacity: 1 }, 12.5)
    .to(
      dot,
      {
        x: 110,
        y: 117,
        duration: 0.6,
        ease: 'power2.inOut',
        onUpdate: () => {
          field.style.setProperty('--gx', `${73 + Number(gsap.getProperty(dot, 'x'))}px`);
          field.style.setProperty('--gy', `${63 + Number(gsap.getProperty(dot, 'y'))}px`);
        },
      },
      12.55,
    )
    .to(
      wc,
      { x: () => spot(909, 782).x, y: () => spot(909, 782).y, duration: 0.6, ease: 'power2.inOut' },
      12.55,
    )
    .to(wc, { opacity: 0, duration: 0.2 }, 13.2)
    .fromTo(
      q('.mw-corner'),
      { opacity: 0, scale: 0.4 },
      { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(1.6)', transformOrigin: '85% 85%' },
      13.15,
    )
    .fromTo(
      q('.mw-note'),
      { opacity: 1, clipPath: 'inset(0% 100% 0% 0%)' },
      { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.5, ease: 'power2.out' },
      13.75,
    )
    .to(q('.mw-corner'), { opacity: 0, duration: 0.15 }, 13.8);

  // 9. 카메라가 오른쪽으로 가고, 도착할 때마다 단계가 튀어나온다
  const step = (cap: number, view: number, n: number | null, link: number | null, at: number) => {
    tl.to(
      canvas,
      { x: () => M().tx(view), y: () => M().ty, duration: 0.9, ease: 'power2.inOut' },
      at,
    );
    swap(cap - 1, cap, at);
    if (n !== null) pop(n, link, at + 0.35);
  };
  tl.to(q('.mw-tfade'), { opacity: 0, duration: 0.4 }, 14.3);
  step(2, 2, 2, 1, 14.3);
  step(3, 3, 3, 2, 15.8);
  step(4, 4, 4, 3, 17.3);
  step(5, 5, 5, 4, 18.8);
  focus([2, 3], 14.3);
  focus([3, 4], 15.8);
  focus([4, 5], 17.3);
  focus([5, 6], 18.8);

  // 10. 답변: 새 답변이 앞으로 쌓인다
  step(6, 6, null, null, 20.3);
  wipeRight(tl, q('.mw-link-5'), 20.65, 0.35);
  const answers = [q('.mw-v-vh'), q('.mw-vclip')];
  tl.fromTo(
    answers,
    { opacity: 0, y: 24 },
    { opacity: 1, y: 0, duration: 0.5, ease: 'back.out(1.6)' },
    20.95,
  )
    .to(q('.mw-c06'), { opacity: 1, duration: 0.25 }, 21.7)
    .fromTo(q('.mw-c06'), { x: -260 }, { x: 0, duration: 0.9, ease: 'power3.out' }, 21.7)
    .to(
      q('.mw-c05'),
      { x: 26, y: -25, scale: 0.9, transformOrigin: '6px 5px', duration: 0.9, ease: 'power3.out' },
      21.7,
    )
    .to({}, { duration: 0.5 }, 22.6);

  // 11. REMIX 로 넘기기: 아이콘 메뉴가 돌아오고 화면이 틀 안으로 줄어든다
  const t = 23.0;
  focus([0, 1, 2, 3, 4, 5, 6], t);
  tl.to(caps[6] ?? [], { autoAlpha: 0, duration: 0.35 }, t)
    .fromTo(
      fbi,
      {
        opacity: 0,
        x: () => M().vw / 2 + 400 * M().kz + 16,
        y: () => M().ty + 150 * M().kz,
        scale: () => M().kz,
      },
      { opacity: 1, x: () => M().vw / 2 + 400 * M().kz, duration: 0.45, ease: 'power3.out' },
      t + 0.1,
    )
    .to(
      fbi,
      {
        x: () => M().end.x + 1648 * M().end.s,
        y: () => M().end.y + 44 * M().end.s,
        scale: () => M().end.s,
        duration: 1.3,
        ease: 'expo.inOut',
      },
      t + 0.6,
    )
    .to(q('.mw-vig'), { opacity: 0, duration: 0.5 }, t + 0.5);
  rectTo(
    t + 0.6,
    1.3,
    () => M().bleed,
    () => M().end,
    'expo.inOut',
  );
  tl.to(
    canvas,
    {
      x: () => M().end.x - 1763 * M().end.s,
      y: () => M().end.y + 68 * M().end.s,
      scale: () => M().end.s,
      duration: 1.3,
      ease: 'expo.inOut',
    },
    t + 0.6,
  )
    .fromTo(
      q('.mw-title--remix'),
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' },
      t + 1.3,
    )
    .to(must(bz, '.mw-rxs'), { opacity: 1, duration: 0.45, ease: 'power1.inOut' }, t + 1.75)
    .to(fbi, { opacity: 0, duration: 0.2 }, t + 2.2)
    .to({}, { duration: 0.5 }, t + 2.2);
}
