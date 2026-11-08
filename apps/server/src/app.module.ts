import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AiModule } from './ai';
import { AllExceptionsFilter } from './common';
import { ConfigModule } from './config';
import { GenerationModule } from './modules/generation/generation.module';
import { HealthModule } from './modules/health/health.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { SessionModule } from './modules/session/session.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AiModule,
    HealthModule,
    SessionModule,
    ProjectsModule,
    GenerationModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
