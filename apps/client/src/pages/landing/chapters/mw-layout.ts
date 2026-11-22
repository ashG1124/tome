/**
 * 기준안 좌표(1728×1117 기준)
 * 창 크기에 따라 달라지는 값(틀 위치·글자 크기·캡션 자리)을 DOM 에 써 넣는다.
 * 연출 시간표(mw-timeline)는 transform 만 움직이고, 기본 자리는 여기서 정한다.
 */
import type { MwGeo } from './mw-geo';
import { all, must } from './mw-dom';
import { windowShadow } from './shared';

/** 제목(눈에 띄는 큰 글)과 이름 글자 크기·위치를 맞춘다. top 은 제목 위쪽 y. */
export function placeTitle(title: HTMLElement, top: number, g: MwGeo): void {
  title.style.top = `${top}px`;
  must(title, 'h2').style.fontSize = `${g.titleFont}px`;
  must(title, '.mw-eyebrow').style.fontSize = `${g.eyebrowFont}px`;
}

export function applyMwLayout(root: HTMLElement, g: MwGeo): void {
  const stage = must(root, '.mw-stage');
  const frame = must(stage, '.mw-frame');
  const { big } = g;
  Object.assign(frame.style, {
    width: `${big.w}px`,
    height: `${big.h}px`,
    left: `${big.x}px`,
    top: `${big.y}px`,
  });
  frame.style.setProperty('--br', `${24 * big.s}px`);
  frame.style.setProperty('--sh', windowShadow(big.s));
  must(frame, '.mw-app').style.transform = `scale(${big.s})`;

  placeTitle(must(stage, '.mw-title--start'), g.start.tTop, g);
  placeTitle(must(stage, '.mw-title--remix'), g.end.tTop, g);

  // 캡션 아래로 노드가 지나갈 때 글자가 비치지 않게 하는 가림막
  const fadeH = g.fadeTop + (g.mob ? 120 : 230 * g.k);
  const solid = (g.fadeTop / fadeH) * 100;
  const mid = solid + (100 - solid) * 0.35;
  const fade = must(stage, '.mw-tfade');
  fade.style.height = `${fadeH}px`;
  fade.style.background = `linear-gradient(to bottom, var(--mw-ground) 0, var(--mw-ground) ${solid.toFixed(1)}%, color-mix(in srgb, var(--mw-ground) 82%, transparent) ${mid.toFixed(1)}%, transparent 100%)`;

  for (const cap of all(stage, '.mw-cap')) {
    cap.style.top = `${g.capTop}px`;
    must(cap, '.mw-cap-e').style.fontSize = `${g.eyebrowCap}px`;
    const h3 = must(cap, '.mw-cap-h');
    h3.style.fontSize = `${g.titleCap}px`;
    h3.style.marginTop = `${g.capBottom - g.capTop - g.eyebrowCap * 1.5}px`;
  }
}
