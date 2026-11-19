import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  type AdminAccessCodeRequest,
  AdminAccessCodeRequestSchema,
  type AdminResetRequest,
  AdminResetRequestSchema,
  type AdminSettingsRequest,
  AdminSettingsRequestSchema,
} from '@tome/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common';
import { Public } from '../session/auth.decorators';
import { UsageService } from '../usage/usage.service';
import { AccessCodesService } from './access-codes.service';
import { AdminGuard } from './admin.guard';
import {
  type HideRequest,
  HideRequestSchema,
  IdParamSchema,
  type PurgeVisitorsRequest,
  PurgeVisitorsRequestSchema,
} from './moderation.schemas';
import { ModerationService } from './moderation.service';
import { ResetService } from './reset.service';

export const LabelSchema = z.string().trim().min(1).max(100);

// 전역 세션 가드는 건너뛰고(@Public) 관리 토큰 가드만 쓴다.
@Public()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly accessCodes: AccessCodesService,
    private readonly usage: UsageService,
    private readonly reset: ResetService,
    private readonly moderation: ModerationService,
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

  @Post('projects/:id/hide')
  @HttpCode(204)
  async hideProject(
    @Param('id', new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(HideRequestSchema)) body: HideRequest,
  ): Promise<void> {
    await this.moderation.hideProject(id, body.hidden);
  }

  @Post('comments/:id/hide')
  @HttpCode(204)
  async hideComment(
    @Param('id', new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(HideRequestSchema)) body: HideRequest,
  ): Promise<void> {
    await this.moderation.hideComment(id, body.hidden);
  }

  @Post('purge-visitors')
  @HttpCode(200)
  purgeVisitors(
    @Body(new ZodValidationPipe(PurgeVisitorsRequestSchema)) body: PurgeVisitorsRequest,
  ) {
    return this.moderation.purgeVisitors(body.confirm);
  }

  @Post('reset')
  @HttpCode(200)
  resetDemo(@Body(new ZodValidationPipe(AdminResetRequestSchema)) body: AdminResetRequest) {
    return this.reset.reset(body.scope);
  }
}
