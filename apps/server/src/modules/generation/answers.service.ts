import { Inject, Injectable } from '@nestjs/common';
import type { GetAnswerResponse } from '@tome/shared';
import { APP_ENV, type Env } from '../../config';
import { AppError } from '../../common';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage';
import type { AuthContext } from '../session/auth.decorators';
import { toAnswer } from './generation.mappers';
import { type AnswerRow, GenerationRepository } from './generation.repository';

export type AssetVariant = 'full' | 'thumb';

@Injectable()
export class AnswersService {
  constructor(
    private readonly repo: GenerationRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  /**
   * 내 프로젝트의 답변이거나, 남의 것이면 게시된(삭제·숨김 아닌) 프로젝트의 확정 답변만 읽을 수 있다.
   * 그 밖에는 존재를 숨기려고 404.
   */
  private async requireReadable(auth: AuthContext, id: string): Promise<AnswerRow> {
    const answer = await this.repo.findAnswer(this.repo.client, id);
    if (!answer) throw new AppError('NOT_FOUND');
    const project = await this.repo.findProject(this.repo.client, answer.set.projectId);
    if (!project || project.deletedAt !== null || project.hiddenAt !== null) {
      throw new AppError('NOT_FOUND');
    }
    const mine = project.ownerId === auth.creatorId;
    if (!mine && (project.postedAt === null || answer.status !== 'accepted')) {
      throw new AppError('NOT_FOUND');
    }
    return answer;
  }

  async get(auth: AuthContext, id: string): Promise<GetAnswerResponse> {
    return { answer: toAnswer(await this.requireReadable(auth, id)) };
  }

  /** 저장소 서명 URL(짧은 수명). download 면 첨부 파일로 내려받게 한다. */
  async assetUrl(
    auth: AuthContext,
    id: string,
    variant: string,
    download: boolean,
  ): Promise<string> {
    if (variant !== 'full' && variant !== 'thumb') throw new AppError('NOT_FOUND');
    const answer = await this.requireReadable(auth, id);
    const key = variant === 'thumb' ? (answer.thumbKey ?? answer.imageKey) : answer.imageKey;
    return this.storage.signedGetUrl(key, {
      ttlSeconds: this.env.ASSET_URL_TTL_SECONDS,
      ...(download ? { downloadName: `tome-answer-${answer.number ?? answer.id}.png` } : {}),
    });
  }
}
