/**
 * DERIVE 챕터의 화면 배치 계산.
 * 기준안 좌표(1728×1117 기준)와 같은 방식이다. 다만 DERIVE 판(board)은 1920 폭이라 아래 숫자는 1920 기준 연출용 값이다.
 * 창 크기(innerWidth/innerHeight)에서 판 배율·카드 위치·글자 크기를 구하고, 크기가 바뀌면 다시 계산한다.
 */
import { HEADER_H } from './shared';

/** 줌 카드가 서는 자리: 화면 왼쪽 위 좌표(x, y)와 배율(s, 카드 원래 크기 436.8 기준) */
export interface Pose {
  x: number;
  y: number;
  s: number;
}

export interface DeriveGeo {
  vw: number;
  vh: number;
  /** 아고라 판 배율과 이동 */
  kb: number;
  tx: number;
  ty: number;
  /** 노드 지도 배율과 이동 */
  km: number;
  mx: number;
  my: number;
  /** 줌 카드: 줄 안 자리 → 크게 펼친 자리 → 원작자 답변 자리 */
  small: Pose;
  big: Pose;
  sha: Pose;
  /** 제목(판 안이라 판 배율로 되돌려 둔 크기) */
  titleFs: number;
  eyebrowFs: number;
  titleGap: number;
  /** 아래 문장 위치·크기와 그 뒤 페이드 높이 */
  textTop: number;
  textFs: number;
  fadeH: number;
}

/** 프로젝트 카드 원래 폭 */
const CARD_W = 436.8;
/** 판 높이(제목+세 줄) */
const BOARD_H = 1250;

export function computeGeo(vw: number, vh: number): DeriveGeo {
  const mob = vw < 820;
  const hh = mob ? 56 : HEADER_H;
  const kb = Math.min(vw / 1920, (vh - hh - 36) / BOARD_H);
  const tx = (vw - 1920 * kb) / 2;
  const ty = hh + Math.max(18, (vh - hh - BOARD_H * kb) / 2) - 121 * kb;
  const km = Math.min(vw / 1920, vh / 1000);
  const mx = (vw - 1920 * km) / 2;
  const my = Math.max(0, (vh - 1080 * km) / 2);
  const kz = Math.min(vw / 1920, (vh - hh) / 1000);
  const bw = 799.77 * kz;
  const bh = 624 * kz;
  const textTop = Math.max(hh + 18, my + 88 * km);
  const textFs = mob ? 22 : Math.max(24, 40 * km);
  const titleFs = mob ? 24 : Math.max(24, (40 * vw) / 1920);
  const eyebrowFs = mob ? 14 : Math.max(14, (24 * vw) / 1920);
  return {
    vw,
    vh,
    kb,
    tx,
    ty,
    km,
    mx,
    my,
    small: { x: tx + 742 * kb, y: ty + 421 * kb, s: kb },
    big: { x: (vw - bw) / 2, y: hh + (vh - hh - bh) / 2, s: bw / CARD_W },
    sha: { x: mx + (1070.34 - 161) * km, y: my + 308.2 * km, s: (451.36 * km) / CARD_W },
    titleFs: titleFs / kb,
    eyebrowFs: eyebrowFs / kb,
    titleGap: Math.min(22, Math.max(10, vw * 0.011)) / kb,
    textTop,
    textFs,
    fadeH: textTop + textFs * 1.5 + Math.max(60, 120 * km),
  };
}

/** 줄마다 "한 바퀴" 폭을 재서 앞쪽 복사본이 왼쪽 바깥으로 빠지게 한다(가운데 묶음이 줄 왼쪽에 놓인다). */
export function setRowPeriods(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.dv-trk').forEach((trk) => {
    const first = trk.querySelector<HTMLElement>('.dv-cp');
    if (first) trk.style.left = `${-first.offsetWidth}px`;
  });
}

/** 계산한 값을 요소에 적용한다(판·지도 이동과 배율, 글자 크기). */
export function applyGeo(root: HTMLElement, g: DeriveGeo): void {
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const board = q('.dv-b');
  const map = q('.dv-m');
  const text = q('.dv-t');
  const fade = q('.dv-fade');
  if (board) board.style.transform = `translate(${g.tx}px,${g.ty}px) scale(${g.kb})`;
  if (map) map.style.transform = `translate(${g.mx}px,${g.my}px) scale(${g.km})`;
  root.style.setProperty('--dv-title-fs', `${g.titleFs}px`);
  root.style.setProperty('--dv-eyebrow-fs', `${g.eyebrowFs}px`);
  root.style.setProperty('--dv-title-gap', `${g.titleGap}px`);
  root.style.setProperty('--dv-text-fs', `${g.textFs}px`);
  if (text) text.style.top = `${g.textTop}px`;
  if (fade) fade.style.height = `${g.fadeH}px`;
  setRowPeriods(root);
}
