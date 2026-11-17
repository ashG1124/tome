import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { UsageModule } from '../usage/usage.module';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

@Module({
  imports: [IdempotencyModule, UsageModule],
  controllers: [ProjectsController],
  providers: [ProjectsRepository, ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
