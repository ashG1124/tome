import { Module } from '@nestjs/common';
import { UsageModule } from '../usage/usage.module';
import { AccessCodesRepository } from './access-codes.repository';
import { AccessCodesService } from './access-codes.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { ModerationRepository } from './moderation.repository';
import { ModerationService } from './moderation.service';
import { ResetRepository } from './reset.repository';
import { ResetService } from './reset.service';

@Module({
  imports: [UsageModule],
  controllers: [AdminController],
  providers: [
    AccessCodesRepository,
    AccessCodesService,
    AdminGuard,
    ModerationRepository,
    ModerationService,
    ResetRepository,
    ResetService,
  ],
})
export class AdminModule {}
