import type { gsap } from '../motion';
import type { MwGeo, Rect } from './mw-geo';

/** MY WORK 시간표 앞·뒤 파일이 함께 쓰는 도구 모음 */
export interface MwCtx {
  tl: gsap.core.Timeline;
  stage: HTMLElement;
  canvas: HTMLElement;
  caps: HTMLElement[];
  wc: HTMLElement;
  fbi: HTMLElement;
  bz: HTMLElement;
  M: () => MwGeo;
  q: (selector: string) => HTMLElement;
  /** 노드 컨트롤 장면 위의 한 점(캔버스 좌표)을 화면 좌표로 */
  spot: (px: number, py: number) => { x: number; y: number };
  swap: (from: number, to: number, at: number) => gsap.core.Timeline;
  pop: (n: number, link: number | null, at: number) => void;
  focus: (focused: readonly number[], at: number) => void;
  rectTo: (at: number, duration: number, from: () => Rect, to: () => Rect, ease: string) => void;
}
