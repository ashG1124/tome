export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface TransportRequest {
  method: HttpMethod;
  /** 쿼리 문자열을 포함한 경로 */
  path: string;
  headers: Record<string, string>;
  body?: unknown;
}

export interface TransportResponse {
  status: number;
  /** 본문이 없으면(204 등) undefined */
  body: unknown;
}

/** 요청을 서버(또는 가짜 서버)에 보내고 응답을 돌려준다. 연결 실패는 NetworkError 로 던진다. */
export type Transport = (request: TransportRequest) => Promise<TransportResponse>;
