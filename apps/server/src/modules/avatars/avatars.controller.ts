import { Controller, Get, Param, Res } from '@nestjs/common';
import { IdSchema } from '@tome/shared';
import type { Response } from 'express';
import { ZodValidationPipe } from '../../common';
import { AvatarsService } from './avatars.service';

@Controller()
export class AvatarsController {
  constructor(private readonly avatars: AvatarsService) {}

  /** 프로필 이미지. 답변 이미지와 같이 Bearer 인증(전역 세션 가드) 뒤에서 서명 URL 로 넘긴다(302). */
  @Get('assets/creators/:id/avatar')
  async avatar(
    @Param('id', new ZodValidationPipe(IdSchema)) id: string,
    @Res() res: Response,
  ): Promise<void> {
    res.redirect(302, await this.avatars.assetUrl(id));
  }
}
