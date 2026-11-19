import { Injectable } from '@nestjs/common';
import type { AdminResetResponse } from '@tome/shared';
import { AppError } from '../../common';
import { PURGE_CONFIRMATION } from './moderation.schemas';
import { ModerationRepository } from './moderation.repository';
import { ResetService } from './reset.service';

@Injectable()
export class ModerationService {
  constructor(
    private readonly repo: ModerationRepository,
    private readonly reset: ResetService,
  ) {}

  /** 이미 숨김이면 첫 시각을 유지하고, 해제하면 null 로 되돌린다. 행이 없으면 404. */
  async hideProject(id: string, hidden: boolean): Promise<void> {
    const row = await this.repo.findProjectHiddenAt(id);
    if (!row) throw new AppError('NOT_FOUND');
    const next = this.nextHiddenAt(row.hiddenAt, hidden);
    if (next !== row.hiddenAt) await this.repo.setProjectHiddenAt(id, next);
  }

  async hideComment(id: string, hidden: boolean): Promise<void> {
    const row = await this.repo.findCommentHiddenAt(id);
    if (!row) throw new AppError('NOT_FOUND');
    const next = this.nextHiddenAt(row.hiddenAt, hidden);
    if (next !== row.hiddenAt) await this.repo.setCommentHiddenAt(id, next);
  }

  /** 확인 문자열이 정확히 같을 때만 visitor 리셋과 같은 삭제를 한다. */
  purgeVisitors(confirm: string): Promise<AdminResetResponse> {
    if (confirm !== PURGE_CONFIRMATION) {
      throw new AppError('VALIDATION_FAILED', 'Confirmation text does not match.');
    }
    return this.reset.reset('visitor');
  }

  private nextHiddenAt(current: Date | null, hidden: boolean): Date | null {
    if (!hidden) return null;
    return current ?? new Date();
  }
}
