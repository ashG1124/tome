import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import {
  type AdminAccessCodeRequest,
  AdminAccessCodeRequestSchema,
  type AdminSettingsRequest,
  AdminSettingsRequestSchema,
} from '@tome/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common';
import { Public } from '../session/auth.decorators';
import { UsageService } from '../usage/usage.service';
import { AccessCodesService } from './access-codes.service';
import { AdminGuard } from './admin.guard';

export const LabelSchema = z.string().trim().min(1).max(100);

// 전역 세션 가드는 건너뛰고(@Public) 관리 토큰 가드만 쓴다.
@Public()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly accessCodes: AccessCodesService,
    private readonly usage: UsageService,
  ) {}

  @Put('access-codes/:label')
  upsert(
    @Param('label', new ZodValidationPipe(LabelSchema)) label: string,
    @Body(new ZodValidationPipe(AdminAccessCodeRequestSchema)) body: AdminAccessCodeRequest,
  ) {
    return this.accessCodes.upsert(label, body);
  }

  @Get('usage')
  getUsage() {
    return this.usage.getUsage();
  }

  @Put('settings')
  updateSettings(
    @Body(new ZodValidationPipe(AdminSettingsRequestSchema)) body: AdminSettingsRequest,
  ) {
    return this.usage.updateSettings(body);
  }
}
