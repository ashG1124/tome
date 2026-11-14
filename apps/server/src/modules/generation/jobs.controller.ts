import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { type AdvanceJobRequest, AdvanceJobRequestSchema, IdSchema } from '@tome/shared';
import { ZodValidationPipe } from '../../common';
import { type AuthContext, CurrentSession } from '../session/auth.decorators';
import { AdvanceService } from './advance.service';
import { GenerationService } from './generation.service';

const idPipe = new ZodValidationPipe(IdSchema);

@Controller('jobs/:jobId')
export class JobsController {
  constructor(
    private readonly generation: GenerationService,
    private readonly advanceService: AdvanceService,
  ) {}

  @Post('advance')
  @HttpCode(200)
  advance(
    @CurrentSession() auth: AuthContext,
    @Param('jobId', idPipe) jobId: string,
    @Body(new ZodValidationPipe(AdvanceJobRequestSchema)) body: AdvanceJobRequest,
  ) {
    return this.advanceService.advance(auth, jobId, body.stage);
  }

  @Get()
  get(@CurrentSession() auth: AuthContext, @Param('jobId', idPipe) jobId: string) {
    return this.generation.getJob(auth, jobId);
  }

  @Post('cancel')
  @HttpCode(200)
  cancel(@CurrentSession() auth: AuthContext, @Param('jobId', idPipe) jobId: string) {
    return this.generation.cancelJob(auth, jobId);
  }
}
