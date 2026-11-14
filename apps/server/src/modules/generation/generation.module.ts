import { Module } from '@nestjs/common';
import { AiModule } from '../../ai';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { ProjectsModule } from '../projects/projects.module';
import { AdvanceService } from './advance.service';
import { AnswersController } from './answers.controller';
import { AnswersService } from './answers.service';
import { WorkspaceController } from './generation.controller';
import { GenerationRepository } from './generation.repository';
import { GenerationService } from './generation.service';
import { JobsController } from './jobs.controller';

@Module({
  imports: [AiModule, IdempotencyModule, ProjectsModule],
  controllers: [WorkspaceController, JobsController, AnswersController],
  providers: [GenerationRepository, GenerationService, AdvanceService, AnswersService],
  exports: [GenerationService],
})
export class GenerationModule {}
