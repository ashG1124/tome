import type { apiConfig } from '../../shared/api';

type CoverConfig = Pick<typeof apiConfig, 'mode' | 'baseUrl'>;

/** 표지 그림을 받는 방법. direct 면 주소를 그림에 그대로 넣고, 아니면 로그인 토큰을 붙여 따로 받아 온다. */
export type CoverSource = { direct: true; src: string } | { direct: false; url: string };

/**
 * 서버가 주는 표지 주소(coverThumbUrl)는 API 경로다. 로그인 토큰이 있어야 받을 수 있어서
 * 그림 요소의 src 에 그대로 넣으면 뜨지 않는다. 그래서 서버 주소를 붙여 따로 받아 온다.
 * 가짜 응답 모드에는 서버가 없으니 주소를 그대로 쓴다. 이미 완성된 주소(http…)도 그대로 쓴다
 * (로그인 토큰을 다른 서버로 보내지 않기 위해서다).
 */
export function coverSource(path: string, config: CoverConfig): CoverSource {
  if (config.mode === 'fake' || /^https?:\/\//.test(path)) return { direct: true, src: path };
  return { direct: false, url: `${config.baseUrl}${path}` };
}

/** 로그인 토큰을 붙여 표지 그림을 받아 온다. 서버가 저장소 주소로 돌려보내면(302) 그대로 따라간다. */
export async function fetchCoverBlob(
  url: string,
  token: string | null,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await fetch(url, {
    headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!response.ok) throw new Error(`cover request failed: ${response.status}`);
  return response.blob();
}
