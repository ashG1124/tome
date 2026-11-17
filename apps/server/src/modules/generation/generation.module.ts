import { Module } from '@nestjs/common';
import { AiModule } from '../../ai';
import { EventsModule } from '../events/events.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { ProjectsModule } from '../projects/projects.module';
import { RemixApplyModule } from '../remix/remix-apply.module';
import { UsageModule } from '../usage/usage.module';
import { AdvanceService } from './advance.service';
import { AnswersController } from './answers.controller';
import { AnswersService } from './answers.service';
import { EditController } from './edit.controller';
import { EditService } from './edit.service';
import { WorkspaceController } from './generation.controller';
import { GenerationRepository } from './generation.repository';
import { GenerationService } from './generation.service';
import { JobsController } from './jobs.controller';

@Module({
  imports: [
    AiModule,
    EventsModule,
    IdempotencyModule,
    ProjectsModule,
    RemixApplyModule,
    UsageModule,
  ],
  controllers: [WorkspaceController, JobsController, AnswersController, EditController],
  providers: [GenerationRepository, GenerationService, AdvanceService, AnswersService, EditService],
  exports: [GenerationService, AnswersService],
})
export class GenerationModule {}
