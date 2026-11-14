import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AiModule } from './ai';
import { AllExceptionsFilter } from './common';
import { ConfigModule } from './config';
import { AdminModule } from './modules/admin/admin.module';
import { GenerationModule } from './modules/generation/generation.module';
import { HealthModule } from './modules/health/health.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { SessionGuard } from './modules/session/session.guard';
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
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}
