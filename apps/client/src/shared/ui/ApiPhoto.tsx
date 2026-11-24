import { useRef, type ReactNode } from 'react';
import { useApiImage } from '../api';

interface ApiPhotoProps {
  /** 서버 그림 주소(예: 창작자 avatarUrl). null 이면 fallback 을 그린다. */
  path: string | null;
  /** 그림 요소에 줄 클래스(크기·모서리·맞춤) */
  className?: string;
  /** 주소가 없거나 그림을 받지 못했을 때 그릴 것(머리글자·기본 그림 등) */
  fallback: ReactNode;
}

/**
 * 로그인 토큰을 붙여 받아야 하는 서버 그림(프로필 사진 등). 장식이라 alt 는 비운다(이름은 옆 글자가 읽힌다).
 * 주소가 없으면 그림을 받지 않고 바로 fallback 을 그린다.
 */
export function ApiPhoto({ path, className, fallback }: ApiPhotoProps) {
  if (path === null) return <>{fallback}</>;
  return <RemotePhoto path={path} className={className} fallback={fallback} />;
}

/** useApiImage 규칙대로 그림 요소는 주소가 있는 동안 늘 그린다. 못 받으면 fallback. */
function RemotePhoto({ path, className, fallback }: ApiPhotoProps & { path: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const { directSrc, failed } = useApiImage(path, ref);
  if (failed) return <>{fallback}</>;
  return <img ref={ref} src={directSrc} alt="" className={className} />;
}
