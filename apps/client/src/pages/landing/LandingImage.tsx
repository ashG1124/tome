import { useState, type CSSProperties } from 'react';
import { landingAsset } from './assets';

interface LandingImageProps {
  /** onboarding 폴더 안 파일 이름 */
  file: string;
  loading: 'eager' | 'lazy';
  /** 원본 픽셀 크기. 주면 img 에 width/height 속성을 달아 불러오기 전에도 자리를 잡는다 */
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * 장식 이미지(alt 비움). 파일이 없거나 불러오기에 실패하면 같은 크기의 회색 자리 표시로 바뀐다.
 */
export function LandingImage({
  file,
  loading,
  width,
  height,
  className,
  style,
}: LandingImageProps) {
  const src = landingAsset(file);
  const [failed, setFailed] = useState(false);
  if (src === undefined || failed) {
    return (
      <span
        aria-hidden="true"
        data-landing-placeholder={file}
        className="landing-placeholder"
        style={style}
      />
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      draggable={false}
      className={className}
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
