import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AdminResetResponse, AdminResetScope } from '@tome/shared';
import { loadSeedContent } from '../../seed/load';
import { answerKeysOf, buildSeedPlan } from '../../seed/plan';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage';
import { ResetRepository } from './reset.repository';

@Injectable()
export class ResetService {
  private readonly logger = new Logger(ResetService.name);

  constructor(
    private readonly repo: ResetRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /**
   * 범위별로 지우고 시드 상태로 다시 맞춘다. DB 는 한 트랜잭션(잠금으로 동시 리셋은 한 줄)이고,
   * 저장소 객체는 커밋 뒤에 best-effort 로 지운다. 공통 데이터(접속 코드·상한·대체 결과·토픽)는 남긴다.
   * 시드 상태의 답변 이미지는 지우지도 다시 올리지도 않는다(키가 고정이라 그대로 남아 있다).
   */
  async reset(scope: AdminResetScope): Promise<AdminResetResponse> {
    const started = Date.now();
    const plan = buildSeedPlan();
    const seedKeys = new Set(plan.answers.flatMap((a) => answerKeysOf(a.id)));
    const seedAnswerIds = new Set(plan.answers.map((a) => a.id));

    const { deleted, keys } = await this.repo.transaction(async (tx) => {
      await this.repo.lock(tx);
      const personas = await this.repo.creatorIds(tx, 'persona');
      const visitors = await this.repo.creatorIds(tx, 'visitor');
      const seeds = await this.repo.creatorIds(tx, 'seed');
      const doPersona = scope === 'persona' || scope === 'all-nonseed';
      const doVisitor = scope === 'visitor' || scope === 'all-nonseed';
      const targets = [...(doPersona ? personas : []), ...(doVisitor ? visitors : [])];

      const answers = await this.repo.answerKeysOf(tx, targets);
      const candidates = answers
        .filter((answer) => !seedAnswerIds.has(answer.id))
        .flatMap((answer) => answer.keys)
        .filter((key) => key.startsWith('answers/') && !seedKeys.has(key));

      if (doPersona) await this.repo.deleteConnectionsWithPartners(tx, personas);
      const deletedProjects = await this.repo.deleteProjects(tx, targets);
      await this.repo.deleteActivity(tx, targets);
      if (doVisitor) {
        await this.repo.deleteSessions(tx, visitors);
        await this.repo.resetVisitorCursor(tx);
      }
      if (scope === 'all-nonseed') {
        await this.repo.cleanSeedProjects(
          tx,
          seeds,
          plan.comments.map((c) => c.id),
        );
      }
      // 시드 상태로 다시 적재(멱등). seed 는 all-nonseed 에서만 다시 맞춘다.
      const reload = [...(doPersona ? personas : []), ...(scope === 'all-nonseed' ? seeds : [])];
      if (reload.length > 0) await loadSeedContent(tx, reload);
      return { deleted: deletedProjects, keys: candidates };
    });

    await this.deleteObjects(keys);
    return { deleted, ms: Date.now() - started };
  }

  /** 커밋 뒤 best-effort. 실패해도 리셋은 성공으로 본다. */
  private async deleteObjects(keys: string[]): Promise<void> {
    let failed = 0;
    for (const key of new Set(keys)) {
      try {
        await this.storage.delete(key);
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) this.logger.warn(`Reset: ${failed} storage objects could not be deleted.`);
  }
}
