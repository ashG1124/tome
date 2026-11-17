import { ErrorCodeSchema, type ErrorCode } from '@tome/shared';

export type ApiMode = 'fake' | 'live';

export interface ApiConfig {
  mode: ApiMode;
  /** live 모드 서버 주소. 비어 있으면 같은 출처의 상대 경로로 호출한다. */
  baseUrl: string;
  /** fake 모드 응답 지연(밀리초) */
  fakeDelayMs: number;
  /** fake 모드에서 모든 요청이 돌려줄 오류 코드 */
  fakeError: ErrorCode | null;
}

type Env = Record<string, string | undefined>;

/** 환경변수를 읽는 유일한 곳이다. 다른 파일은 import.meta.env 를 직접 읽지 않는다. */
export function readApiConfig(env: Env): ApiConfig {
  const delay = Number.parseInt(env.VITE_FAKE_DELAY_MS ?? '', 10);
  const fakeError = ErrorCodeSchema.safeParse(env.VITE_FAKE_ERROR);
  return {
    mode: env.VITE_API_MODE === 'live' ? 'live' : 'fake',
    baseUrl: (env.VITE_API_BASE_URL ?? '').replace(/\/+$/, ''),
    fakeDelayMs: Number.isFinite(delay) && delay > 0 ? delay : 0,
    fakeError: fakeError.success ? fakeError.data : null,
  };
}

export const apiConfig: ApiConfig = readApiConfig(import.meta.env);
