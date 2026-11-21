import { useState, type CSSProperties } from 'react';
import { landingAsset } from './assets';

interface LandingImageProps {
  /** onboarding 폴더 안 파일 이름 */
  file: string;
  loading: 'eager' | 'lazy';
  className?: string;
  style?: CSSProperties;
}

/**
 * 장식 이미지(alt 비움). 파일이 없거나 불러오기에 실패하면 같은 크기의 회색 자리 표시로 바뀐다.
 */
export function LandingImage({ file, loading, className, style }: LandingImageProps) {
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
      loading={loading}
      decoding="async"
      draggable={false}
      className={className}
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
