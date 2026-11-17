import { Body, Controller, Delete, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import {
  type CreateNodeCommentRequest,
  CreateNodeCommentRequestSchema,
  IdSchema,
} from '@tome/shared';
import type { Response } from 'express';
import { IdempotencyKey, ZodValidationPipe } from '../../common';
import { type AuthContext, CurrentSession } from '../session/auth.decorators';
import { CommentsService } from './comments.service';

const idPipe = new ZodValidationPipe(IdSchema);

@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('answers/:id/comments')
  list(@CurrentSession() auth: AuthContext, @Param('id', idPipe) id: string) {
    return this.comments.list(auth, id);
  }

  @Post('answers/:id/comments')
  @HttpCode(201)
  async create(
    @CurrentSession() auth: AuthContext,
    @IdempotencyKey() key: string | undefined,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(CreateNodeCommentRequestSchema)) body: CreateNodeCommentRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.comments.create(auth, key, id, body);
    res.status(result.statusCode);
    return result.body;
  }

  @Delete('node-comments/:id')
  @HttpCode(204)
  async remove(@CurrentSession() auth: AuthContext, @Param('id', idPipe) id: string) {
    await this.comments.remove(auth, id);
  }
}
