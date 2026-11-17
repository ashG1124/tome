import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { ProjectsModule } from '../projects/projects.module';
import { IdentityController } from './identity.controller';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';

@Module({
  imports: [EventsModule, ProjectsModule],
  controllers: [IdentityController],
  providers: [IdentityRepository, IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
