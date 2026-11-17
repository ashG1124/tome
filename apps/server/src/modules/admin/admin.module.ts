import { Module } from '@nestjs/common';
import { UsageModule } from '../usage/usage.module';
import { AccessCodesRepository } from './access-codes.repository';
import { AccessCodesService } from './access-codes.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [UsageModule],
  controllers: [AdminController],
  providers: [AccessCodesRepository, AccessCodesService, AdminGuard],
})
export class AdminModule {}
