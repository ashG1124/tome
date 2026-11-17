import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'tome:isPublic';
export const ALLOW_BEFORE_CONSENT_KEY = 'tome:allowBeforeConsent';

/** 로그인 없이 부를 수 있는 라우트(전역 가드 생략). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** 동의 전에도 부를 수 있는 라우트. 이 표시가 없는 라우트는 현재 안내 버전에 동의해야 한다. */
export const AllowBeforeConsent = () => SetMetadata(ALLOW_BEFORE_CONSENT_KEY, true);

export interface AuthContext {
  sessionId: string;
  creatorId: string;
}

/** 가드가 request 에 세션 정보를 붙여 두는 속성 이름. */
export const AUTH_REQUEST_KEY = 'tomeAuth';

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext =>
    context.switchToHttp().getRequest<Record<string, AuthContext>>()[AUTH_REQUEST_KEY]!,
);
