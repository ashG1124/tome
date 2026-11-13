import { Module } from '@nestjs/common';
import { LoginRateLimiter } from './login-rate-limiter';
import { SessionController } from './session.controller';
import { SessionGuard } from './session.guard';
import { SessionRepository } from './session.repository';
import { SessionService } from './session.service';

// 인스턴스 1개 전제: 연속 실패 카운터는 이 프로세스 메모리에만 있다.
@Module({
  controllers: [SessionController],
  providers: [
    SessionRepository,
    SessionService,
    SessionGuard,
    { provide: LoginRateLimiter, useFactory: () => new LoginRateLimiter() },
  ],
  exports: [SessionService, SessionGuard],
})
export class SessionModule {}
