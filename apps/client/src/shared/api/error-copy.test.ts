import { ErrorCodeSchema } from '@tome/shared';
import { describe, expect, it } from 'vitest';
import { COPY } from '../copy';
import { authRedirectTarget, ERROR_COPY, errorCopyKey } from './error-copy';
import { ApiRequestError, NetworkError } from './errors';

function apiError(code: ApiRequestError['code'], status = 400) {
  return new ApiRequestError(status, { code, message: code, retryable: false });
}

describe('ERROR_COPY', () => {
  it('오류 코드 34개를 모두 키로 가진다', () => {
    expect(ErrorCodeSchema.options).toHaveLength(34);
    expect(Object.keys(ERROR_COPY).sort()).toEqual([...ErrorCodeSchema.options].sort());
  });

  it('가리키는 문구 키는 모두 COPY 에 있다', () => {
    for (const keys of Object.values(ERROR_COPY)) {
      for (const key of keys ?? []) expect(COPY).toHaveProperty([key]);
    }
  });
});

describe('errorCopyKey', () => {
  it('코드에 이어진 첫 문구를 돌려준다', () => {
    expect(errorCopyKey(apiError('ACCESS_CODE_INVALID', 401))).toBe('C-05b');
    expect(errorCopyKey(apiError('RATE_LIMITED', 429))).toBe('G2');
  });

  it('문구가 없는 코드와 알 수 없는 오류는 E-01a 로 대신한다', () => {
    expect(errorCopyKey(apiError('NO_CHANGES', 422))).toBe('E-01a');
    expect(errorCopyKey(new Error('boom'))).toBe('E-01a');
  });

  it('연결 실패는 E-03 이다', () => {
    expect(errorCopyKey(new NetworkError())).toBe('E-03');
  });
});

describe('authRedirectTarget', () => {
  it('인증·동의 오류만 다른 화면으로 보낸다', () => {
    expect(authRedirectTarget(apiError('UNAUTHENTICATED', 401))).toBe('/enter');
    expect(authRedirectTarget(apiError('CONSENT_REQUIRED', 403))).toBe('/consent');
    expect(authRedirectTarget(apiError('NOT_FOUND', 404))).toBeNull();
    expect(authRedirectTarget(new NetworkError())).toBeNull();
  });
});
