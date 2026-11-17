import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AiModule } from './ai';
import { AllExceptionsFilter } from './common';
import { ConfigModule } from './config';
import { AdminModule } from './modules/admin/admin.module';
import { CommentsModule } from './modules/comments/comments.module';
import { EventsModule } from './modules/events/events.module';
import { GenerationModule } from './modules/generation/generation.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { SessionGuard } from './modules/session/session.guard';
import { UsageModule } from './modules/usage/usage.module';
import { SessionModule } from './modules/session/session.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AiModule,
    StorageModule,
    HealthModule,
    SessionModule,
    AdminModule,
    ProjectsModule,
    GenerationModule,
    EventsModule,
    CommentsModule,
    UsageModule,
    IdentityModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}
