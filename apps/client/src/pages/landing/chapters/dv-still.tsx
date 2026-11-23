import { useLayoutEffect, useRef } from 'react';
import { COPY } from '../../../shared/copy';
import { AgoraRows } from './dv-cards';
import { MY_BOX, SHOT_BOX } from './dv-data';
import { setRowPeriods } from './dv-layout';
import { DeriveEyebrow, DeriveTitle, DotTail, Shot } from './dv-parts';
import './derive.css';

/**
 * 정지 화면 버전(움직임 줄이기·?motion=off·느린 PC).
 * 기준안 좌표(1728×1117 기준)와 같은 방식으로 1920 폭 판을 칸 폭에 맞춰 줄여 보여 준다. gsap 은 쓰지 않는다.
 */
const BOARD_W = 1920;
/** 판에서 보여 줄 세로 구간(세 줄이 들어 있는 곳) */
const BOARD_CROP_TOP = 400;
const BOARD_CROP_H = 970;

export function DeriveStill() {
  const frameRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const board = frame.querySelector<HTMLElement>('.dv-still-board');
    const fit = () => {
      const s = frame.clientWidth / BOARD_W;
      frame.style.height = `${BOARD_CROP_H * s}px`;
      if (board) board.style.transform = `scale(${s}) translateY(${-BOARD_CROP_TOP}px)`;
      setRowPeriods(frame);
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(frame);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <section
        id="derive"
        data-chapter="derive"
        className="landing-chapter dv dv-still"
        aria-labelledby="dv-title"
      >
        <div className="dv-still-head">
          <DeriveEyebrow />
          <DeriveTitle />
        </div>
        <div ref={frameRef} className="dv-still-frame">
          <div className="dv-still-board">
            <AgoraRows />
          </div>
        </div>
        <div className="dv-still-step">
          <h3>{COPY['ON-33a']}</h3>
          <div className="dv-still-art" style={{ aspectRatio: `${SHOT_BOX[2]} / ${SHOT_BOX[3]}` }}>
            <Shot file="dv_sha" className="dv-still-img" loading="eager" />
          </div>
        </div>
        <div className="dv-still-step">
          <h3>{COPY['ON-33b']}</h3>
          <div className="dv-still-art" style={{ aspectRatio: `${MY_BOX[2]} / ${MY_BOX[3]}` }}>
            <Shot file="dv_my" className="dv-still-img" loading="eager" />
          </div>
          <p className="dv-still-label">{COPY['ON-38']}</p>
        </div>
      </section>
      <DotTail />
    </>
  );
}
