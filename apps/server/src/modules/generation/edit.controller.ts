import { Body, Controller, HttpCode, Param, Patch, Post, Put, Res } from '@nestjs/common';
import {
  type CreateRevisionRequest,
  CreateRevisionRequestSchema,
  IdSchema,
  type PinAnswerRequest,
  PinAnswerRequestSchema,
  type UpdateVerificationRequest,
  UpdateVerificationRequestSchema,
} from '@tome/shared';
import type { Response } from 'express';
import { IdempotencyKey, ZodValidationPipe } from '../../common';
import { type AuthContext, CurrentSession } from '../session/auth.decorators';
import { EditService } from './edit.service';

const idPipe = new ZodValidationPipe(IdSchema);

/** 편집 재생성(revise)·Apply·핀·검증 기록. */
@Controller()
export class EditController {
  constructor(private readonly edit: EditService) {}

  @Post('sets/:setId/revisions')
  @HttpCode(201)
  async createRevision(
    @CurrentSession() auth: AuthContext,
    @IdempotencyKey() key: string | undefined,
    @Param('setId', idPipe) setId: string,
    @Body(new ZodValidationPipe(CreateRevisionRequestSchema)) body: CreateRevisionRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.edit.createRevision(auth, key, setId, body);
    res.status(result.statusCode);
    return result.body;
  }

  @Post('answers/:id/accept')
  @HttpCode(200)
  async accept(
    @CurrentSession() auth: AuthContext,
    @IdempotencyKey() key: string | undefined,
    @Param('id', idPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.edit.accept(auth, key, id);
    res.status(result.statusCode);
    return result.body;
  }

  @Put('answers/:id/pin')
  @HttpCode(200)
  pin(
    @CurrentSession() auth: AuthContext,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(PinAnswerRequestSchema)) body: PinAnswerRequest,
  ) {
    return this.edit.pin(auth, id, body.pinned);
  }

  @Patch('answers/:id/verification')
  @HttpCode(200)
  updateVerification(
    @CurrentSession() auth: AuthContext,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(UpdateVerificationRequestSchema)) body: UpdateVerificationRequest,
  ) {
    return this.edit.updateVerification(auth, id, body);
  }
}
