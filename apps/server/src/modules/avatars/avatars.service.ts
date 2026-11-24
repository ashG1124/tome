import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../common';
import { APP_ENV, type Env } from '../../config';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage';
import { AvatarsRepository } from './avatars.repository';

@Injectable()
export class AvatarsService {
  constructor(
    private readonly repo: AvatarsRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  /**
   * 프로필 이미지의 짧은 수명 서명 URL. 프로필 이미지는 공개 정보라 로그인한 세션이면 누구 것이든 볼 수 있다.
   * 창작자가 없거나 이미지가 없으면 404.
   */
  async assetUrl(creatorId: string): Promise<string> {
    const key = await this.repo.findAvatarKey(creatorId);
    if (!key) throw new AppError('NOT_FOUND');
    return this.storage.signedGetUrl(key, { ttlSeconds: this.env.ASSET_URL_TTL_SECONDS });
  }
}
