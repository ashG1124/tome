import { timingSafeEqual } from 'node:crypto';
import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../../common';
import { APP_ENV, type Env } from '../../config';

/** 관리 토큰 비교. 설정이 없거나 길이가 다르면 바로 false, 같으면 timingSafeEqual. */
export function isAdminTokenValid(expected: string | undefined, provided: unknown): boolean {
  if (!expected || typeof provided !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(APP_ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!isAdminTokenValid(this.env.ADMIN_TOKEN, request.headers['x-admin-token'])) {
      throw new AppError('ADMIN_TOKEN_INVALID');
    }
    return true;
  }
}
