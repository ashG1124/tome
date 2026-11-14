import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { type CreateSetRequest, CreateSetRequestSchema, IdSchema } from '@tome/shared';
import type { Response } from 'express';
import { IdempotencyKey, ZodValidationPipe } from '../../common';
import { type AuthContext, CurrentSession } from '../session/auth.decorators';
import { GenerationService } from './generation.service';

const idPipe = new ZodValidationPipe(IdSchema);

/** 워크스페이스·페이지·세트(모두 /projects/:id 아래). */
@Controller('projects/:id')
export class WorkspaceController {
  constructor(private readonly generation: GenerationService) {}

  @Get('workspace')
  workspace(
    @CurrentSession() auth: AuthContext,
    @Param('id', idPipe) id: string,
    @Query('pageId', new ZodValidationPipe(IdSchema.optional())) pageId: string | undefined,
  ) {
    return this.generation.workspace(auth, id, pageId);
  }

  @Post('pages')
  @HttpCode(201)
  async createPage(
    @CurrentSession() auth: AuthContext,
    @IdempotencyKey() key: string | undefined,
    @Param('id', idPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.generation.createPage(auth, key, id);
    res.status(result.statusCode);
    return result.body;
  }

  @Post('sets')
  @HttpCode(201)
  async createSet(
    @CurrentSession() auth: AuthContext,
    @IdempotencyKey() key: string | undefined,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(CreateSetRequestSchema)) body: CreateSetRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.generation.createSet(auth, key, id, body);
    res.status(result.statusCode);
    return result.body;
  }
}
