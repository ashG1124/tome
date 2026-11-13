import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  ConsentResponse,
  CreateSessionResponse,
  CreatorSummary,
  MeResponse,
} from '@tome/shared';
import { AppError } from '../../common';
import type { AuthContext } from './auth.decorators';
import { verifyCode } from './code-hash';
import { LoginRateLimiter } from './login-rate-limiter';
import { type CreatorRow, SessionRepository } from './session.repository';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const LAST_SEEN_INTERVAL_MS = 5 * 60 * 1000;
export const USER_AGENT_MAX = 200;
export const DEFAULT_NOTICE_VERSION = '1';

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

function toCreatorSummary(row: CreatorRow): CreatorSummary {
  // 이미지 경로 규칙은 뒤 단계에서 정한다. 지금은 비워 둔다.
  return {
    id: row.id,
    kind: row.kind,
    displayName: row.displayName,
    bio: row.bio,
    avatarUrl: null,
  };
}

@Injectable()
export class SessionService {
  constructor(
    private readonly repository: SessionRepository,
    private readonly limiter: LoginRateLimiter,
  ) {}

  async getNoticeVersion(): Promise<string> {
    return (await this.repository.getNoticeVersion()) ?? DEFAULT_NOTICE_VERSION;
  }

  async createSession(
    code: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<CreateSessionResponse> {
    const retryAfterSec = this.limiter.blockedFor(ip);
    if (retryAfterSec !== null) throw new AppError('RATE_LIMITED', undefined, { retryAfterSec });

    const accessCode = await this.findMatchingCode(code);
    if (!accessCode) {
      this.limiter.recordFailure(ip);
      throw new AppError('ACCESS_CODE_INVALID');
    }
    this.limiter.reset(ip);

    const creatorId = accessCode.creatorId ?? (await this.pickVisitorId());
    const creator = await this.repository.findCreator(creatorId);
    if (!creator) throw new AppError('INTERNAL');

    const token = randomBytes(32).toString('base64url');
    await this.repository.createSession({
      tokenHash: hashToken(token),
      creatorId,
      accessCodeId: accessCode.id,
      userAgent: userAgent ? userAgent.slice(0, USER_AGENT_MAX) : null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
    return {
      token,
      creator: toCreatorSummary(creator),
      consentRequired: true,
      noticeVersion: await this.getNoticeVersion(),
    };
  }

  /** 토큰으로 세션을 찾는다. 없거나 만료·폐기면 UNAUTHENTICATED. */
  async authenticate(token: string): Promise<AuthContext> {
    const now = new Date();
    const session = await this.repository.findLiveSessionByTokenHash(hashToken(token), now);
    if (!session) throw new AppError('UNAUTHENTICATED');
    if (now.getTime() - session.lastSeenAt.getTime() > LAST_SEEN_INTERVAL_MS) {
      await this.repository.touchSession(session.id, now);
    }
    return { sessionId: session.id, creatorId: session.creatorId };
  }

  async hasCurrentConsent(sessionId: string): Promise<boolean> {
    return this.repository.hasConsent(sessionId, await this.getNoticeVersion());
  }

  async consent(auth: AuthContext, noticeVersion: string): Promise<ConsentResponse> {
    if (noticeVersion !== (await this.getNoticeVersion())) throw new AppError('NOTICE_OUTDATED');
    const agreedAt = await this.repository.ensureConsent(
      auth.sessionId,
      auth.creatorId,
      noticeVersion,
    );
    return { agreedAt: agreedAt.toISOString() };
  }

  async me(auth: AuthContext): Promise<MeResponse> {
    const creator = await this.repository.findCreator(auth.creatorId);
    if (!creator) throw new AppError('INTERNAL');
    return {
      creator: toCreatorSummary(creator),
      consented: await this.hasCurrentConsent(auth.sessionId),
      limits: {},
    };
  }

  async revoke(auth: AuthContext): Promise<void> {
    await this.repository.revokeSession(auth.sessionId, new Date());
  }

  private async findMatchingCode(code: string) {
    const candidates = await this.repository.findActiveAccessCodes();
    for (const candidate of candidates) {
      if (await verifyCode(code, candidate.codeHash)) return candidate;
    }
    return null;
  }

  /** 방문자 계정을 로그인 순서대로 돌려가며 배정한다. */
  private async pickVisitorId(): Promise<string> {
    const visitors = await this.repository.listVisitorIds();
    if (visitors.length === 0) throw new AppError('INTERNAL');
    const n = await this.repository.nextVisitorCursor();
    return visitors[(n - 1) % visitors.length]!;
  }
}
