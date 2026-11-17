import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import {
  type CreateProjectRequest,
  CreateProjectRequestSchema,
  type FinishProjectRequest,
  FinishProjectRequestSchema,
  IdSchema,
  type PostProjectRequest,
  PostProjectRequestSchema,
  type UpdateProjectRequest,
  UpdateProjectRequestSchema,
} from '@tome/shared';
import type { Response } from 'express';
import { IdempotencyKey, ZodValidationPipe } from '../../common';
import { type AuthContext, CurrentSession } from '../session/auth.decorators';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentSession() auth: AuthContext) {
    return this.projects.list(auth);
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentSession() auth: AuthContext,
    @IdempotencyKey() key: string | undefined,
    @Body(new ZodValidationPipe(CreateProjectRequestSchema)) body: CreateProjectRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.projects.create(auth, key, body);
    res.status(result.statusCode);
    return result.body;
  }

  @Patch(':id')
  update(
    @CurrentSession() auth: AuthContext,
    @Param('id', new ZodValidationPipe(IdSchema)) id: string,
    @Body(new ZodValidationPipe(UpdateProjectRequestSchema)) body: UpdateProjectRequest,
  ) {
    return this.projects.update(auth, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentSession() auth: AuthContext,
    @Param('id', new ZodValidationPipe(IdSchema)) id: string,
  ): Promise<void> {
    await this.projects.remove(auth, id);
  }

  @Get(':id/finish-candidates')
  finishCandidates(
    @CurrentSession() auth: AuthContext,
    @Param('id', new ZodValidationPipe(IdSchema)) id: string,
  ) {
    return this.projects.finishCandidates(auth, id);
  }

  @Post(':id/finish')
  @HttpCode(200)
  async finish(
    @CurrentSession() auth: AuthContext,
    @IdempotencyKey() key: string | undefined,
    @Param('id', new ZodValidationPipe(IdSchema)) id: string,
    @Body(new ZodValidationPipe(FinishProjectRequestSchema)) body: FinishProjectRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.projects.finish(auth, key, id, body);
    res.status(result.statusCode);
    return result.body;
  }

  @Put(':id/post')
  post(
    @CurrentSession() auth: AuthContext,
    @Param('id', new ZodValidationPipe(IdSchema)) id: string,
    @Body(new ZodValidationPipe(PostProjectRequestSchema)) body: PostProjectRequest,
  ) {
    return this.projects.setPosted(auth, id, body);
  }
}
