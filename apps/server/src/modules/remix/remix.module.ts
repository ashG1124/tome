import { Module } from '@nestjs/common';
import { AgoraModule } from '../agora/agora.module';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { RemixApplyModule } from './remix-apply.module';
import { RemixController } from './remix.controller';
import { RemixService } from './remix.service';

@Module({
  imports: [AgoraModule, EventsModule, IdentityModule, RemixApplyModule],
  controllers: [RemixController],
  providers: [RemixService],
  exports: [RemixService],
})
export class RemixModule {}
