import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { GenerationModule } from '../generation/generation.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { CommentsController } from './comments.controller';
import { CommentsRepository } from './comments.repository';
import { CommentsService } from './comments.service';

@Module({
  imports: [GenerationModule, IdempotencyModule, EventsModule],
  controllers: [CommentsController],
  providers: [CommentsRepository, CommentsService],
})
export class CommentsModule {}
