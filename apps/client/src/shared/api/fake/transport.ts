import { apiConfig } from '../config';
import type { Transport, TransportResponse } from '../transport';
import { FAKE_TOKEN } from './data';
import { errorResponse, FakeFailure } from './errors';
import { matchRoute } from './routes';
import { fakeState } from './state';
import { fakeStore, saveFakeStore } from './store';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 이번 요청이 돌려줄 오류. URL 로 지정한 것은 한 번만, 환경변수로 지정한 것은 계속 쓴다. */
function takeSimulatedError() {
  if (fakeState.pendingError !== null) {
    const code = fakeState.pendingError;
    fakeState.pendingError = null;
    return code;
  }
  return apiConfig.fakeError;
}

function handle(
  method: Parameters<Transport>[0]['method'],
  path: string,
  headers: Record<string, string>,
  body: unknown,
): TransportResponse {
  const simulated = takeSimulatedError();
  if (simulated !== null) throw new FakeFailure(simulated);

  const [pathname = path, search = ''] = path.split('?');
  const matched = matchRoute(method, pathname);
  if (!matched) throw new FakeFailure('NOT_FOUND');
  const { route, params } = matched;

  if (route.auth && headers.Authorization !== `Bearer ${FAKE_TOKEN}`) {
    throw new FakeFailure('UNAUTHENTICATED');
  }
  if (route.requiresConsent && !fakeState.consented) throw new FakeFailure('CONSENT_REQUIRED');
  if (route.idempotent && !headers['Idempotency-Key']) {
    throw new FakeFailure('IDEMPOTENCY_KEY_MISSING');
  }

  // 같은 키 + 같은 요청이면 처음 응답을 그대로, 같은 키로 다른 요청이면 409(서버 규칙과 같다).
  const key = headers['Idempotency-Key'];
  const request = `${method} ${path} ${JSON.stringify(body ?? null)}`;
  const records = fakeStore(fakeState.emptyProjects).idempotency;
  if (key !== undefined) {
    const record = records[key];
    if (record !== undefined) {
      if (record.request !== request) throw new FakeFailure('IDEMPOTENCY_KEY_REUSED');
      return { status: record.status, body: record.body };
    }
  }

  const data = route.response.parse(
    route.handle({ params, query: new URLSearchParams(search), body }),
  );
  const response = { status: route.status, body: data };
  // 실패한 요청은 기록하지 않아 같은 키로 다시 시도할 수 있다. 바뀐 데이터는 새로고침해도 남게 저장한다.
  if (key !== undefined) records[key] = { request, ...response };
  if (method !== 'GET') saveFakeStore();
  return response;
}

/** 서버 없이 계약 모양의 고정 데이터를 돌려주는 전송 계층. */
export const fakeTransport: Transport = async ({ method, path, headers, body }) => {
  if (apiConfig.fakeDelayMs > 0) await sleep(apiConfig.fakeDelayMs);
  try {
    return handle(method, path, headers, body);
  } catch (error) {
    if (error instanceof FakeFailure) return errorResponse(error.code);
    throw error;
  }
};
