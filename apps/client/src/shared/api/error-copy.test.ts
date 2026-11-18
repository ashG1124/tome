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

  describe('VALIDATION_FAILED', () => {
    function validation(details?: Record<string, unknown>) {
      return new ApiRequestError(400, {
        code: 'VALIDATION_FAILED',
        message: 'bad',
        retryable: false,
        details,
      });
    }

    it('title 항목이 있으면 E-04', () => {
      expect(errorCopyKey(validation({ fields: [{ path: 'title', message: 'x' }] }))).toBe('E-04');
      expect(errorCopyKey(validation({ fields: [{ path: 'title.0', message: 'x' }] }))).toBe(
        'E-04',
      );
    });

    it('다른 항목이면 E-01a', () => {
      expect(errorCopyKey(validation({ fields: [{ path: 'coverAnswerId', message: 'x' }] }))).toBe(
        'E-01a',
      );
    });

    it('details 가 없거나 이상한 모양이면 E-01a', () => {
      expect(errorCopyKey(validation())).toBe('E-01a');
      expect(errorCopyKey(validation({ fields: 'title' }))).toBe('E-01a');
      expect(errorCopyKey(validation({ fields: [null, { path: 1 }] }))).toBe('E-01a');
    });
  });

  it('IDENTITY_PRIVATE 는 P-20 이고 S-04 가 아니다', () => {
    const key = errorCopyKey(apiError('IDENTITY_PRIVATE', 403));
    expect(key).toBe('P-20');
    expect(key).not.toBe('S-04');
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
