import { Injectable } from '@nestjs/common';
import type {
  AdminSettingsRequest,
  AdminSettingsResponse,
  AdminUsageResponse,
  UsageCaps,
} from '@tome/shared';
import { AppError } from '../../common';
import { UsageRepository } from './usage.repository';
import {
  DEFAULT_CAPS,
  decideLimit,
  matchPreset,
  SETTING_KEYS,
  type UsageTally,
  utcDateString,
} from './usage.rules';

export interface LimitStatus {
  dailyLimitReached: boolean;
  budgetReached: boolean;
  /** 둘 다면 BUDGET_REACHED */
  code: 'BUDGET_REACHED' | 'DAILY_LIMIT_REACHED' | null;
}

const positiveOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

const monthStart = (now: Date): string => `${now.toISOString().slice(0, 7)}-01`;
const nextMonthStart = (now: Date): string =>
  utcDateString(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)));

@Injectable()
export class UsageService {
  constructor(private readonly repo: UsageRepository) {}

  async getCaps(): Promise<UsageCaps> {
    const stored = await this.repo.getSettings(Object.values(SETTING_KEYS));
    return {
      dailyNeuronCap: positiveOr(stored[SETTING_KEYS.dailyNeuronCap], DEFAULT_CAPS.dailyNeuronCap),
      monthlyCostCapUsd: positiveOr(
        stored[SETTING_KEYS.monthlyCostCapUsd],
        DEFAULT_CAPS.monthlyCostCapUsd,
      ),
    };
  }

  /** 지금 상한에 닿았는지(월 비용 → 하루 neurons). 던지지 않는다. */
  async checkLimits(now: Date = new Date()): Promise<LimitStatus> {
    const [caps, today, month] = await Promise.all([
      this.getCaps(),
      this.repo.getDay(utcDateString(now)),
      this.repo.sumRange(monthStart(now), nextMonthStart(now)),
    ]);
    return decideLimit({ todayNeurons: today.neuronsEst, monthCostUsd: month.costUsdEst }, caps);
  }

  /** 상한에 닿았으면 BUDGET_REACHED·DAILY_LIMIT_REACHED 를 던진다. 다른 서비스(편집 재생성 등)도 이것을 부른다. */
  async assertWithinLimits(now: Date = new Date()): Promise<void> {
    const status = await this.checkLimits(now);
    if (status.code) throw new AppError(status.code);
  }

  /**
   * 세트·job 을 만들기 전 확인. 상한에 닿았어도 프리셋 문장 그대로면 통과시킨다
   * (이후 advance 가 대체 결과로 채운다).
   */
  async assertWithinLimitsOrSample(
    presetKey: string | null | undefined,
    prompt: string,
  ): Promise<void> {
    const status = await this.checkLimits();
    if (status.code && matchPreset(presetKey, prompt) === null) throw new AppError(status.code);
  }

  /** AI 를 실제로 부른 단계의 사용량을 오늘(UTC) 행에 더한다. 부르지 않았으면 아무것도 하지 않는다. */
  async record(tally: UsageTally, now: Date = new Date()): Promise<void> {
    if (!tally.called) return;
    await this.repo.addUsage(utcDateString(now), {
      textCalls: tally.textCalls,
      imageCount: tally.imageCount,
      fallbackCount: tally.fallbackCount,
      neurons: tally.neurons,
    });
  }

  findSample(presetKey: string) {
    return this.repo.findSampleByScenario(presetKey);
  }

  async getUsage(now: Date = new Date()): Promise<AdminUsageResponse> {
    const date = utcDateString(now);
    const [caps, today, month] = await Promise.all([
      this.getCaps(),
      this.repo.getDay(date),
      this.repo.sumRange(monthStart(now), nextMonthStart(now)),
    ]);
    return {
      today: { date, ...today },
      month: { month: date.slice(0, 7), ...month },
      caps,
    };
  }

  async updateSettings(body: AdminSettingsRequest): Promise<AdminSettingsResponse> {
    if (body.dailyNeuronCap !== undefined) {
      await this.repo.setSetting(SETTING_KEYS.dailyNeuronCap, body.dailyNeuronCap);
    }
    if (body.monthlyCostCapUsd !== undefined) {
      await this.repo.setSetting(SETTING_KEYS.monthlyCostCapUsd, body.monthlyCostCapUsd);
    }
    return { settings: await this.getCaps() };
  }
}
