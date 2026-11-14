import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { IdSchema } from '@tome/shared';
import type { Response } from 'express';
import { ZodValidationPipe } from '../../common';
import { type AuthContext, CurrentSession } from '../session/auth.decorators';
import { AnswersService } from './answers.service';

const idPipe = new ZodValidationPipe(IdSchema);

@Controller()
export class AnswersController {
  constructor(private readonly answers: AnswersService) {}

  @Get('answers/:id')
  get(@CurrentSession() auth: AuthContext, @Param('id', idPipe) id: string) {
    return this.answers.get(auth, id);
  }

  /** 이미지는 Bearer 인증 뒤에서 서명 URL 로 넘긴다(302). */
  @Get('assets/answers/:id/:variant')
  async asset(
    @CurrentSession() auth: AuthContext,
    @Param('id', idPipe) id: string,
    @Param('variant') variant: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.answers.assetUrl(auth, id, variant, download === '1');
    res.redirect(302, url);
  }
}
