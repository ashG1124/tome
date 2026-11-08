import { ApiErrorSchema, type IdempotencyKey } from '@tome/shared';
import { apiConfig } from './config';
import { ApiRequestError } from './errors';
import { fakeTransport } from './fake/transport';
import { liveTransport } from './live';
import { clearSession, useSessionStore } from './session';
import type { HttpMethod } from './transport';

export function newIdempotencyKey(): IdempotencyKey {
  return crypto.randomUUID();
}

interface HeaderOptions {
  token: string | null;
  hasBody: boolean;
  /** true 이면 Idempotency-Key 를 새로 만들어 붙인다. */
  idempotent: boolean;
}

export function buildHeaders({
  token,
  hasBody,
  idempotent,
}: HeaderOptions): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (hasBody) headers['Content-Type'] = 'application/json';
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  if (idempotent) headers['Idempotency-Key'] = newIdempotencyKey();
  return headers;
}

/** zod 스키마처럼 parse 로 값을 검사해 돌려주는 것 */
export interface Parser<T> {
  parse(data: unknown): T;
}

export interface RequestOptions<T> {
  method: HttpMethod;
  path: string;
  schema: Parser<T>;
  body?: unknown;
  /** false 이면 토큰을 보내지 않는다(health·세션 만들기). 기본 true. */
  auth?: boolean;
  /** 멱등 표시가 있는 변경 요청이면 true */
  idempotent?: boolean;
  /** 오류 상태여도 schema 모양의 본문이면 성공으로 받을 상태(예: health 503) */
  allowStatus?: readonly number[];
}

/** 요청을 보내고 schema 로 응답을 검사해 돌려준다. 오류 응답은 ApiRequestError 로 던진다. */
export async function request<T>(options: RequestOptions<T>): Promise<T> {
  const { method, path, schema, body, auth = true, idempotent = false, allowStatus = [] } = options;
  const transport = apiConfig.mode === 'fake' ? fakeTransport : liveTransport;
  const headers = buildHeaders({
    token: auth ? useSessionStore.getState().token : null,
    hasBody: body !== undefined,
    idempotent,
  });

  const response = await transport({ method, path, headers, body });

  if (response.status >= 400) {
    if (allowStatus.includes(response.status)) {
      try {
        return schema.parse(response.body);
      } catch {
        // 오류 본문이면 아래에서 오류로 던진다.
      }
    }
    const parsed = ApiErrorSchema.safeParse(response.body);
    const error = parsed.success
      ? parsed.data.error
      : { code: 'INTERNAL' as const, message: `HTTP ${response.status}`, retryable: false };
    if (error.code === 'UNAUTHENTICATED') clearSession();
    throw new ApiRequestError(response.status, error);
  }
  return schema.parse(response.body);
}
