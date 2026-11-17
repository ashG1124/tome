import { useQuery } from '@tanstack/react-query';
import { useEffect, type RefObject } from 'react';
import { apiConfig } from './config';
import { apiImageSource, fetchApiImageBlob } from './image';
import { useSessionStore } from './session';

/** 받은 그림을 다시 쓰는 시간. 화면에 돌아올 때마다 같은 그림을 또 받지 않게 한다. */
const IMAGE_STALE_MS = 5 * 60 * 1000;

interface ApiImage {
  /** 주소를 그대로 써도 될 때만 값이 있다(가짜 응답 모드, 완성된 주소). */
  directSrc: string | undefined;
  /** 그림을 받아 오지 못했다. */
  failed: boolean;
}

/**
 * 서버 그림(표지·답변 그림)을 그림 요소에 넣는다. imageRef 는 그 그림 요소다.
 * 서버 모드에서는 로그인 토큰으로 그림을 받아(TanStack Query 가 잠시 기억한다) 임시 주소(blob)로 바꿔 넣고,
 * 그림 요소가 사라지거나 그림이 바뀌면 그 임시 주소를 해제한다(URL.revokeObjectURL).
 * 가짜 응답 모드에서는 directSrc 를 src 에 그대로 넣으면 된다.
 * 주의: 그림 요소(img)는 조건 없이 늘 렌더해야 한다. 그림을 다 받은 뒤에 img 가 새로 생기면 주소가 들어가지 않는다.
 */
export function useApiImage(
  path: string | null,
  imageRef: RefObject<HTMLImageElement | null>,
): ApiImage {
  const source = path === null ? null : apiImageSource(path, apiConfig);
  const fetchUrl = source !== null && !source.direct ? source.url : null;
  // 다른 계정으로 다시 들어오면 이전 계정이 받은 그림을 다시 쓰지 않도록 토큰도 키에 넣는다.
  const token = useSessionStore((state) => state.token);
  const image = useQuery({
    queryKey: ['api-image', fetchUrl, token],
    queryFn: ({ signal }) => fetchApiImageBlob(fetchUrl ?? '', token, signal),
    enabled: fetchUrl !== null,
    // 못 받으면 쓰는 화면이 빈 면으로 그린다. 목록을 다시 받으면 그때 새로 시도한다.
    retry: false,
    staleTime: IMAGE_STALE_MS,
  });
  const blob = image.data;

  useEffect(() => {
    const element = imageRef.current;
    if (element === null || blob === undefined) return;
    const objectUrl = URL.createObjectURL(blob);
    element.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob, imageRef]);

  return { directSrc: source?.direct ? source.src : undefined, failed: image.isError };
}
