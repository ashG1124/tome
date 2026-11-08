import type { CSSProperties } from 'react';
import { ICON_URLS } from './icon-registry';

interface IconProps {
  /** 아이콘 이름. 예: `edit`, `warning`, `logo` */
  name: string;
  /** 한 변의 길이(px) */
  size?: number;
  className?: string;
}

/**
 * 색은 글자색(currentColor)을 따른다. 장식용이라 항상 aria-hidden 이다.
 * 이름이 필요한 곳(아이콘만 있는 버튼)은 버튼에 aria-label 을 둔다.
 * 아이콘 파일이 없으면 같은 크기의 투명한 빈 자리를 그린다.
 */
export function Icon({ name, size = 24, className }: IconProps) {
  const url = ICON_URLS[name];
  const style: CSSProperties = {
    display: 'inline-block',
    flex: 'none',
    width: size,
    height: size,
  };
  if (url !== undefined) {
    const image = `url("${url}")`;
    style.backgroundColor = 'currentColor';
    style.maskImage = image;
    style.WebkitMaskImage = image;
    style.maskRepeat = 'no-repeat';
    style.WebkitMaskRepeat = 'no-repeat';
    style.maskPosition = 'center';
    style.WebkitMaskPosition = 'center';
    style.maskSize = 'contain';
    style.WebkitMaskSize = 'contain';
  }
  return (
    <span
      aria-hidden="true"
      data-icon={name}
      data-icon-missing={url === undefined ? 'true' : undefined}
      className={className}
      style={style}
    />
  );
}
