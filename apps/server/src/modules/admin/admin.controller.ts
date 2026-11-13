import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import { type AdminAccessCodeRequest, AdminAccessCodeRequestSchema } from '@tome/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common';
import { Public } from '../session/auth.decorators';
import { AccessCodesService } from './access-codes.service';
import { AdminGuard } from './admin.guard';

export const LabelSchema = z.string().trim().min(1).max(100);

// 전역 세션 가드는 건너뛰고(@Public) 관리 토큰 가드만 쓴다.
@Public()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly accessCodes: AccessCodesService) {}

  @Put('access-codes/:label')
  upsert(
    @Param('label', new ZodValidationPipe(LabelSchema)) label: string,
    @Body(new ZodValidationPipe(AdminAccessCodeRequestSchema)) body: AdminAccessCodeRequest,
  ) {
    return this.accessCodes.upsert(label, body);
  }
}
