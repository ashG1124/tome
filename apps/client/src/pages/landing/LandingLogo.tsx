import type { CSSProperties } from 'react';
import { ICON_URLS } from '../../shared/ui/icon-registry';

function maskStyle(name: string): CSSProperties {
  const url = ICON_URLS[name];
  if (url === undefined) return {};
  const image = `url("${url}")`;
  return {
    backgroundColor: 'currentColor',
    maskImage: image,
    WebkitMaskImage: image,
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskSize: 'contain',
    WebkitMaskSize: 'contain',
  };
}

interface LandingLogoProps {
  /** 로고 크기. 시안(디자인 단위)의 연결 기호 한 변, 글자 로고 폭·높이 */
  size: { mark: number; wordWidth: number; wordHeight: number };
  className?: string;
}

/** 연결 기호 + TÓME 글자 로고. 그림일 뿐이라 aria-hidden 이고, 이름은 감싸는 쪽이 붙인다. 파일이 없으면 같은 크기 빈 자리 */
export function LandingLogo({ size, className }: LandingLogoProps) {
  const vars = {
    '--logo-mark': size.mark,
    '--logo-word-w': size.wordWidth,
    '--logo-word-h': size.wordHeight,
  } as CSSProperties;
  return (
    <span aria-hidden="true" className={`landing-logo ${className ?? ''}`} style={vars}>
      <span
        className="landing-logo-mark"
        data-logo="graphic-connection"
        style={maskStyle('graphic-connection')}
      />
      <span className="landing-logo-word" data-logo="logo" style={maskStyle('logo')} />
    </span>
  );
}
