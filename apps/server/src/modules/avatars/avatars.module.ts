import { Module } from '@nestjs/common';
import { AvatarsController } from './avatars.controller';
import { AvatarsRepository } from './avatars.repository';
import { AvatarsService } from './avatars.service';

/** 창작자 프로필 이미지(GET /assets/creators/:id/avatar). 경로 규칙은 avatar-url.ts. */
@Module({
  controllers: [AvatarsController],
  providers: [AvatarsService, AvatarsRepository],
})
export class AvatarsModule {}
