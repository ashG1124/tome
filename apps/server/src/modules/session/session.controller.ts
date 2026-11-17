import { Body, Controller, Delete, Get, HttpCode, Post, Req } from '@nestjs/common';
import {
  type ConsentRequest,
  ConsentRequestSchema,
  type CreateSessionRequest,
  CreateSessionRequestSchema,
} from '@tome/shared';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../common';
import { AllowBeforeConsent, type AuthContext, CurrentSession, Public } from './auth.decorators';
import { SessionService } from './session.service';

@Controller()
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  @Public()
  @Post('session')
  @HttpCode(200)
  create(
    @Body(new ZodValidationPipe(CreateSessionRequestSchema)) body: CreateSessionRequest,
    @Req() req: Request,
  ) {
    // IP 는 메모리 카운터 키로만 쓰고 저장·로그하지 않는다.
    return this.sessions.createSession(body.code, req.ip ?? 'unknown', req.headers['user-agent']);
  }

  @AllowBeforeConsent()
  @Post('session/consent')
  @HttpCode(200)
  consent(
    @CurrentSession() auth: AuthContext,
    @Body(new ZodValidationPipe(ConsentRequestSchema)) body: ConsentRequest,
  ) {
    return this.sessions.consent(auth, body.noticeVersion);
  }

  @AllowBeforeConsent()
  @Get('me')
  me(@CurrentSession() auth: AuthContext) {
    return this.sessions.me(auth);
  }

  @AllowBeforeConsent()
  @Delete('session')
  @HttpCode(204)
  async revoke(@CurrentSession() auth: AuthContext): Promise<void> {
    await this.sessions.revoke(auth);
  }
}
