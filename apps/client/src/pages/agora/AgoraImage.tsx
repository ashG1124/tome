import { useRef } from 'react';
import { useApiImage } from '../../shared/api';

interface AgoraImageProps {
  /** 서버 그림 주소. 없으면 빈 면만 그린다. */
  path: string | null;
  className?: string;
}

/**
 * 아고라 카드·상세의 그림. 로그인 토큰이 필요한 서버 그림은 공통 useApiImage 로 받는다.
 * 장식이라 alt 를 비운다(제목은 카드 글자로 읽힌다). 그림이 없거나 못 받으면 빈 면이 보인다.
 */
export function AgoraImage({ path, className }: AgoraImageProps) {
  const ref = useRef<HTMLImageElement>(null);
  const { directSrc, failed } = useApiImage(path, ref);
  const base = ['absolute inset-0 size-full bg-[color:var(--color-fill-card)]', className]
    .filter(Boolean)
    .join(' ');
  if (path === null || failed) return <span aria-hidden="true" className={base} />;
  return (
    <img
      ref={ref}
      src={directSrc}
      alt=""
      loading="lazy"
      className={`${base} pointer-events-none object-cover`}
    />
  );
}
