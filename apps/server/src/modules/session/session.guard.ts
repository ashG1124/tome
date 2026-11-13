import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppError } from '../../common';
import { ALLOW_BEFORE_CONSENT_KEY, AUTH_REQUEST_KEY, IS_PUBLIC_KEY } from './auth.decorators';
import { SessionService } from './session.service';

const BEARER = /^Bearer (\S+)$/;

/** 전역 인증 가드. @Public 이 아니면 Bearer 토큰을, @AllowBeforeConsent 가 아니면 현재 버전 동의를 요구한다. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<Request & Record<string, unknown>>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (!token) throw new AppError('UNAUTHENTICATED');

    const auth = await this.sessions.authenticate(token);
    request[AUTH_REQUEST_KEY] = auth;

    if (!this.reflector.getAllAndOverride<boolean>(ALLOW_BEFORE_CONSENT_KEY, targets)) {
      if (!(await this.sessions.hasCurrentConsent(auth.sessionId))) {
        throw new AppError('CONSENT_REQUIRED');
      }
    }
    return true;
  }
}
