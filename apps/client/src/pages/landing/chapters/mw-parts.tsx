import type { CSSProperties } from 'react';
import { LandingImage } from '../LandingImage';
import { landingAsset } from '../assets';
import { APP_H, APP_W } from './shared';
import { cx } from './mw-dom';
import { MyWorkMark, RemixMark } from './nodes-icons';
import './mw-parts.css';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const place = (box: Box): CSSProperties => ({
  left: box.x,
  top: box.y,
  width: box.w,
  height: box.h,
});

/**
 * 자리 잡은 장식 이미지. 파일이 없으면 같은 크기의 빈 자리가 대신 그려진다.
 * 연출이 이름으로 붙잡을 수 있게 이미지 대신 바깥 상자에 className 을 단다.
 */
export function Pic({
  file,
  box,
  className,
  style,
  eager = false,
  dim,
}: {
  file: string;
  box: Box;
  className?: string;
  style?: CSSProperties;
  eager?: boolean;
  /** REMIX 지도에서 물러서는 투명도 */
  dim?: number;
}) {
  return (
    <div className={cx('mw-pic', className)} style={{ ...place(box), ...style }} data-dim={dim}>
      <LandingImage
        file={file}
        loading={eager ? 'eager' : 'lazy'}
        width={box.w}
        height={box.h}
        className="mw-pic-img"
      />
    </div>
  );
}

/** 1728×1117 화면 이미지의 한 조각만 보여 주는 상자(배경 이미지 잘라 쓰기). 파일이 없으면 빈 자리. */
export function Crop({
  file,
  box,
  from,
  className,
  style,
}: {
  file: string;
  box: Box;
  /** 이미지 안에서 가져올 왼쪽 위(기본은 box 와 같은 자리) */
  from?: readonly [number, number];
  className?: string;
  style?: CSSProperties;
}) {
  const src = landingAsset(file);
  const [fx, fy] = from ?? [box.x, box.y];
  return (
    <div
      className={cx('mw-crop', src === undefined && 'mw-crop--blank', className)}
      data-landing-placeholder={src === undefined ? file : undefined}
      style={{
        ...place(box),
        ...(src === undefined
          ? null
          : {
              backgroundImage: `url(${src})`,
              backgroundSize: `${APP_W}px ${APP_H}px`,
              backgroundPosition: `-${fx}px -${fy}px`,
            }),
        ...style,
      }}
    />
  );
}

/** 데모 화면의 가짜 마우스 포인터. 클릭 고리는 shared 의 cursorClick 이 쓰는 이름을 따른다. */
export function Cursor({ className }: { className: string }) {
  return (
    <div className={cx('mw-cursor', className)} aria-hidden="true">
      <svg viewBox="0 0 32 32">
        <path d="M6 3l17 12-7.6 1.4 4.4 8.6-3.5 1.7-4.3-8.7L6 24z" />
      </svg>
      <span className="landing-cursor-ring" />
    </div>
  );
}

/** 제목 위 영문 이름. 글자 하나가 그림 글자로 바뀐다(읽는 이에게는 원래 단어). */
export function Eyebrow({ word, kind }: { word: string; kind: 'mywork' | 'remix' }) {
  const at = kind === 'mywork' ? word.indexOf('O') : word.indexOf('M');
  const Mark = kind === 'mywork' ? MyWorkMark : RemixMark;
  return (
    <p className="mw-eyebrow">
      <span className="mw-sr">{word}</span>
      <span aria-hidden="true" className="mw-eyebrow-art">
        {word.slice(0, at)}
        <Mark className="mw-eyebrow-mark" />
        {word.slice(at + 1)}
      </span>
    </p>
  );
}
