/**
 * DERIVE 스크롤 연출(타임라인). 화면 9장 높이만큼 고정(pin)한 채 스크롤로 재생한다.
 * 기준안 좌표(1728×1117 기준)와 같은 방식의 연출용 숫자이며, 길이는 타임라인 초 단위(스크롤에 비례)다.
 */
import { gsap } from '../motion';
import { pinOptions } from './shared';
import type { DeriveGeo } from './dv-layout';

/** CSS 변수(토큰) 값을 읽는다. 트윈 도착색을 토큰에서 얻기 위해 쓴다. */
function token(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/** stage 안의 요소 하나를 찾는다. 없으면 연출을 만들 수 없으니 오류로 알린다. */
function need<T extends Element>(stage: Element, sel: string): T {
  const el = stage.querySelector<T>(sel);
  if (!el) throw new Error(`DERIVE: ${sel} 요소가 없습니다`);
  return el;
}

export function buildTimeline(stage: HTMLElement, geo: () => DeriveGeo): gsap.core.Timeline {
  const q = <T extends Element = HTMLElement>(sel: string) => need<T>(stage, sel);
  const all = (sel: string) => Array.from(stage.querySelectorAll(sel));
  const trk = (n: number) => q(`.dv-r${n} .dv-trk`);
  const head = q('.dv-h');
  const z = q('.dv-z');
  const card = q('[data-dv-hero]');
  const rows = all('.dv-row');
  const bg = q('.dv-bg');
  const map = q('.dv-m');
  const fade = q('.dv-fade');
  const t1 = q('.dv-t1');
  const t2 = q('.dv-t2');
  const line = q<SVGPathElement>('.dv-ln path');
  const line5 = q('.dv-l5 path');
  const dot = q('.dv-dot');
  const shot = q('.dv-sha');
  const veiled = q('.dv-shf');
  const mine = q('.dv-my');
  const label = q('.dv-lab');

  const at = (k: 'small' | 'big' | 'sha') => ({
    x: () => geo()[k].x,
    y: () => geo()[k].y,
    scale: () => geo()[k].s,
  });

  const muted = token(stage, '--color-font-disable');
  const tl = gsap.timeline({ scrollTrigger: pinOptions(stage, 9) });
  gsap.set(z, { transformOrigin: '0 0', force3D: false });

  // 1. 아고라 세 줄이 서로 스쳐 지나가다 "가운데 카드"가 한가운데 오도록 멈춘다. 제목이 떠오른다.
  tl.fromTo(trk(1), { x: 1500 }, { x: 0, duration: 2.4, ease: 'power1.inOut' }, 0)
    .fromTo(trk(2), { x: 900 }, { x: 0, duration: 2.4, ease: 'power1.inOut' }, 0)
    .fromTo(trk(3), { x: -1500 }, { x: 0, duration: 2.4, ease: 'power1.inOut' }, 0)
    .fromTo(
      head,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' },
      0,
    );

  // 2. 프로젝트 하나가 줄에서 떠올라 크게 펼쳐진다. 줄·제목은 사라지고 점 배경이 나타난다.
  tl.set(z, { opacity: 1, ...at('small') }, 2.55)
    .set(card, { opacity: 0 }, 2.55)
    .to(z, { ...at('big'), duration: 1.1, ease: 'expo.inOut' }, 2.6)
    .to([head, ...rows], { opacity: 0, duration: 0.6, ease: 'power1.in' }, 2.6)
    .to(bg, { opacity: 1, duration: 0.8 }, 2.9);

  // 3. 카드가 원작자의 답변 자리로 내려앉고, 주변에 노드 지도가 떠오른다.
  tl.to(z, { ...at('sha'), duration: 1.1, ease: 'expo.inOut' }, 4.3)
    .to(map, { opacity: 1, duration: 0.7, ease: 'power1.inOut' }, 4.75)
    .to(z, { opacity: 0, duration: 0.35 }, 5.15)
    .fromTo(fade, { opacity: 0 }, { opacity: 1, duration: 0.5 }, 5.0)
    .fromTo(
      t1,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' },
      5.1,
    );

  // 4. 파생: 내 답변이 아래로 갈라져 나오고, 원작은 흰 막 뒤로 물러난다.
  // 길이를 잴 수 없는 환경(테스트용 jsdom)에서는 넉넉한 값으로 대신한다
  const len = typeof line.getTotalLength === 'function' ? line.getTotalLength() : 1000;
  gsap.set(line, { strokeDasharray: len, strokeDashoffset: len });
  tl.to(t1, { opacity: 0, y: -14, duration: 0.4 }, 6.4)
    .fromTo(t2, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 6.6)
    .to(line, { strokeDashoffset: 0, duration: 0.8, ease: 'power2.inOut' }, 6.6)
    .to(veiled, { opacity: 1, duration: 0.6 }, 7.0)
    .to(shot, { opacity: 0, duration: 0.6 }, 7.0)
    .to(line5, { stroke: muted, duration: 0.6 }, 6.75)
    .to(dot, { backgroundColor: muted, duration: 0.6 }, 6.75)
    .fromTo(
      mine,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.7, ease: 'back.out(1.4)' },
      7.25,
    )
    .to(label, { opacity: 1, duration: 0.4 }, 7.45)
    .to({}, { duration: 0.5 }, 8.0);

  return tl;
}
