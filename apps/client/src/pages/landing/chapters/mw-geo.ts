/**
 * 기준안 좌표(1728×1117 기준)
 * MY WORK·REMIX 가 함께 쓰는 화면 크기 계산(순수 함수). 창 크기가 바뀔 때마다 다시 부른다.
 * 값은 모두 px 이고, 앱 화면 캡처(1728×1117)를 창 안에 몇 배로, 어디에 놓을지를 정한다.
 */
import { APP_H, APP_RATIO, APP_W, HEADER_H } from './shared';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** 화면보다 크게 키운 틀(s 는 1728 대비 배율) */
export interface BleedRect extends Rect {
  s: number;
}
/** 제목 아래에 놓는 틀 하나(tTop 은 제목 위쪽 y) */
export interface TitleFrame extends Rect {
  tTop: number;
  s: number;
}

export interface MwGeo {
  vw: number;
  vh: number;
  mob: boolean;
  /** 헤더 높이 */
  hh: number;
  /** 제목·이름 글자 크기 */
  titleFont: number;
  eyebrowFont: number;
  /** MY WORK 처음 틀(제목 아래) */
  start: TitleFrame;
  /** REMIX 제목 아래 틀(MY WORK 끝, REMIX 처음) */
  end: TitleFrame;
  /** 큰 틀(탐색기 크기) */
  big: Rect & { s: number };
  /** 처음 틀을 큰 틀 대비 몇 배로 줄이는지 */
  startRatio: number;
  /** 화면 밖까지 키운 틀 */
  bleed: BleedRect;
  /** 작업 영역 카메라 배율(k)과 캔버스 배율(kz) */
  k: number;
  kz: number;
  /** i 번째 지점을 화면 가운데 두는 캔버스 x */
  tx: (i: number) => number;
  /** 캔버스 y(처음·맞춘 뒤) */
  ty: number;
  tyEdit: number;
  /** 노드 컨트롤 장면 x */
  txNode: number;
  /** 작성줄(composer) 배율 */
  composerScale: number;
  /** 단계 설명(캡션) 위치·크기 */
  capTop: number;
  capBottom: number;
  eyebrowCap: number;
  titleCap: number;
  /** 캡션 아래 가림막 */
  fadeTop: number;
}

/** 캔버스에서 각 지점의 가운데 x(프롬프트, 1~5단계, 답변 순) */
export const CAMERA_X: readonly number[] = [534, 882, 1244, 1639, 2034, 2429, 3042];

const MOBILE_W = 820;

/** 제목 아래 놓는 틀: 남는 높이에 맞추되 폭은 frac 을 넘지 않는다. */
function titleFrame(
  vw: number,
  vh: number,
  hh: number,
  tf: number,
  ef: number,
  frac: number,
  lines: number,
): TitleFrame {
  const tTop = hh + Math.max(14, vh * 0.04);
  const tH = ef * 1.4 + Math.max(10, ef * 0.9) + tf * 1.5 * lines;
  const fTop = tTop + tH + Math.max(18, vh * 0.045);
  const bottom = Math.max(22, vh * 0.05);
  const h0 = vh - fTop - bottom;
  const w = Math.min(h0 * APP_RATIO, vw * frac);
  return { tTop, x: (vw - w) / 2, y: fTop, w, h: w / APP_RATIO, s: w / APP_W };
}

export function computeGeo(vw: number, vh: number): MwGeo {
  const mob = vw < MOBILE_W;
  const hh = mob ? 56 : HEADER_H;
  const titleFont = mob ? 24 : Math.max(24, (40 * vw) / 1920);
  const eyebrowFont = mob ? 14 : Math.max(14, (24 * vw) / 1920);
  const start = titleFrame(vw, vh, hh, titleFont, eyebrowFont, mob ? 0.9 : 0.574, 2);
  const end = titleFrame(vw, vh, hh, titleFont, eyebrowFont, mob ? 0.92 : 0.78, mob ? 2 : 1);

  const w2 = Math.min(vw * (mob ? 0.92 : 0.9), (vh - hh - (mob ? 60 : 44)) * APP_RATIO);
  const h2 = w2 / APP_RATIO;
  const x2 = (vw - w2) / 2;
  const y2 = hh + 14 + Math.max(0, (vh - hh - 28 - h2) / 2);
  const ka = w2 / APP_W;

  // 화면 밖까지 키운 틀: 작업 영역(메뉴 막대 아래)이 화면을 덮는다
  const sx = Math.max((vw + 40) / APP_W, (vh + 40) / 1083);
  const bleed: BleedRect = {
    w: APP_W * sx,
    h: APP_H * sx,
    s: sx,
    x: (vw - APP_W * sx) / 2,
    y: (vh - 1083 * sx) / 2 - 34 * sx,
  };

  const k = mob ? Math.min(vw / 520, vh / 900) : Math.min(vw / 1920, vh / 1080);
  const hdE = mob ? hh + 14 : hh + Math.max(22, 40 * k);
  const hdH = hdE + (mob ? 28 : 70 * k);
  const nodeTop = mob ? Math.max(hdH + 90, vh * 0.3) : Math.max(282 * k, hdH + 40 * k * 1.5 + 40);
  const ty = nodeTop - 94 * k;
  const fsH = mob ? 22 : Math.max(24, 40 * k);

  return {
    vw,
    vh,
    mob,
    hh,
    titleFont,
    eyebrowFont,
    start,
    end,
    big: { x: x2, y: y2, w: w2, h: h2, s: ka },
    startRatio: start.w / w2,
    bleed,
    k,
    kz: k,
    tx: (i) => vw / 2 - (CAMERA_X[i] ?? 0) * k,
    ty,
    tyEdit: Math.min(ty, 18 * k, vh - 60 - 888 * k),
    txNode: vw / 2 - 1038 * k,
    composerScale: mob ? (vw - 32) / 620 : Math.min(1.5 * k, (vw - 80) / 620),
    capTop: hdE,
    capBottom: hdH,
    eyebrowCap: mob ? 14 : Math.max(15, 26 * k),
    titleCap: fsH,
    fadeTop: hdH + fsH * 1.5 + 18,
  };
}

/** REMIX 의 세 번째 틀: 노드 지도 전체를 보여 주는 크기 */
export function mapFrame(vw: number, vh: number, hh: number): Rect {
  const w = Math.min(vw * 0.9, (vh - hh - 48) * APP_RATIO);
  const h = w / APP_RATIO;
  return { x: (vw - w) / 2, y: hh + 24 + Math.max(0, (vh - hh - 48 - h) / 2), w, h };
}
