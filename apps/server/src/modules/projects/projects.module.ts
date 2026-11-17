import { Module } from '@nestjs/common';
import { AiModule } from '../../ai';
import { EventsModule } from '../events/events.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { UsageModule } from '../usage/usage.module';
import { InputSafetyService } from './input-safety.service';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

@Module({
  imports: [AiModule, IdempotencyModule, UsageModule, EventsModule],
  controllers: [ProjectsController],
  providers: [ProjectsRepository, ProjectsService, InputSafetyService],
  exports: [ProjectsService, InputSafetyService],
})
export class ProjectsModule {}
