import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { GenerationModule } from '../generation/generation.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { ProjectsModule } from '../projects/projects.module';
import { AgoraController } from './agora.controller';
import { AgoraRepository } from './agora.repository';
import { AgoraService } from './agora.service';

@Module({
  imports: [GenerationModule, ProjectsModule, IdempotencyModule, EventsModule],
  controllers: [AgoraController],
  providers: [AgoraRepository, AgoraService],
  exports: [AgoraService],
})
export class AgoraModule {}
