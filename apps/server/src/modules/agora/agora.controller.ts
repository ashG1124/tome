import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import {
  type CreateAgoraCommentRequest,
  CreateAgoraCommentRequestSchema,
  IdSchema,
} from '@tome/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { IdempotencyKey, ZodValidationPipe } from '../../common';
import { type AuthContext, CurrentSession } from '../session/auth.decorators';
import { AgoraService } from './agora.service';

const idPipe = new ZodValidationPipe(IdSchema);

const CommentQuerySchema = z.object({
  before: IdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
type CommentQuery = z.infer<typeof CommentQuerySchema>;

@Controller()
export class AgoraController {
  constructor(private readonly agora: AgoraService) {}

  @Get('agora')
  home() {
    return this.agora.home();
  }

  @Get('agora/topics/:id')
  topic(@Param('id', idPipe) id: string) {
    return this.agora.topic(id);
  }

  @Get('agora/projects/:id')
  project(@Param('id', idPipe) id: string) {
    return this.agora.getProject(id);
  }

  @Post('agora/projects/:id/views')
  @HttpCode(204)
  async view(@CurrentSession() auth: AuthContext, @Param('id', idPipe) id: string): Promise<void> {
    await this.agora.recordView(auth, id);
  }

  @Post('agora/projects/:id/derive')
  @HttpCode(201)
  async derive(
    @CurrentSession() auth: AuthContext,
    @IdempotencyKey() key: string | undefined,
    @Param('id', idPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.agora.derive(auth, key, id);
    res.status(result.statusCode);
    return result.body;
  }

  @Get('projects/:id/comments')
  listComments(
    @CurrentSession() auth: AuthContext,
    @Param('id', idPipe) id: string,
    @Query(new ZodValidationPipe(CommentQuerySchema)) query: CommentQuery,
  ) {
    return this.agora.listComments(auth, id, query);
  }

  @Post('projects/:id/comments')
  @HttpCode(201)
  async createComment(
    @CurrentSession() auth: AuthContext,
    @IdempotencyKey() key: string | undefined,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(CreateAgoraCommentRequestSchema)) body: CreateAgoraCommentRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.agora.createComment(auth, key, id, body);
    res.status(result.statusCode);
    return result.body;
  }

  @Delete('comments/:id')
  @HttpCode(204)
  async removeComment(
    @CurrentSession() auth: AuthContext,
    @Param('id', idPipe) id: string,
  ): Promise<void> {
    await this.agora.removeComment(auth, id);
  }
}
