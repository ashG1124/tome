import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { RemixApplyService } from './remix-apply.service';
import { RemixRepository } from './remix.repository';

@Module({
  imports: [EventsModule],
  providers: [RemixRepository, RemixApplyService],
  exports: [RemixApplyService, RemixRepository],
})
export class RemixApplyModule {}
