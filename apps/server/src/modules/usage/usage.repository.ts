import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FREE_NEURONS_PER_DAY, USD_PER_1000_NEURONS } from './usage.rules';

export interface UsageTotals {
  textCalls: number;
  imageCount: number;
  fallbackCount: number;
  neuronsEst: number;
  costUsdEst: number;
}

export interface UsageDelta {
  textCalls: number;
  imageCount: number;
  fallbackCount: number;
  neurons: number;
}

const ZERO: UsageTotals = {
  textCalls: 0,
  imageCount: 0,
  fallbackCount: 0,
  neuronsEst: 0,
  costUsdEst: 0,
};

@Injectable()
export class UsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 한 SQL 문으로 그 날 행에 더한다. 동시 요청이 와도 행 잠금으로 줄 서서 누락이 없다. */
  async addUsage(date: string, delta: UsageDelta): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "UsageDaily" ("date", "textCalls", "imageCount", "fallbackCount", "neuronsEst", "costUsdEst")
      VALUES (
        ${date}::date, ${delta.textCalls}::int, ${delta.imageCount}::int, ${delta.fallbackCount}::int,
        ${delta.neurons}::numeric,
        GREATEST(${delta.neurons}::numeric - ${FREE_NEURONS_PER_DAY}::numeric, 0) * ${USD_PER_1000_NEURONS}::numeric / 1000
      )
      ON CONFLICT ("date") DO UPDATE SET
        "textCalls" = "UsageDaily"."textCalls" + EXCLUDED."textCalls",
        "imageCount" = "UsageDaily"."imageCount" + EXCLUDED."imageCount",
        "fallbackCount" = "UsageDaily"."fallbackCount" + EXCLUDED."fallbackCount",
        "neuronsEst" = "UsageDaily"."neuronsEst" + EXCLUDED."neuronsEst",
        "costUsdEst" = GREATEST("UsageDaily"."neuronsEst" + EXCLUDED."neuronsEst" - ${FREE_NEURONS_PER_DAY}::numeric, 0)
          * ${USD_PER_1000_NEURONS}::numeric / 1000
    `);
  }

  async getDay(date: string): Promise<UsageTotals> {
    const row = await this.prisma.usageDaily.findUnique({ where: { date: new Date(date) } });
    if (!row) return { ...ZERO };
    return {
      textCalls: row.textCalls,
      imageCount: row.imageCount,
      fallbackCount: row.fallbackCount,
      neuronsEst: row.neuronsEst.toNumber(),
      costUsdEst: row.costUsdEst.toNumber(),
    };
  }

  /** [from, to) UTC 날짜 범위의 합계. */
  async sumRange(from: string, to: string): Promise<UsageTotals> {
    const sum = await this.prisma.usageDaily.aggregate({
      where: { date: { gte: new Date(from), lt: new Date(to) } },
      _sum: {
        textCalls: true,
        imageCount: true,
        fallbackCount: true,
        neuronsEst: true,
        costUsdEst: true,
      },
    });
    return {
      textCalls: sum._sum.textCalls ?? 0,
      imageCount: sum._sum.imageCount ?? 0,
      fallbackCount: sum._sum.fallbackCount ?? 0,
      neuronsEst: sum._sum.neuronsEst?.toNumber() ?? 0,
      costUsdEst: sum._sum.costUsdEst?.toNumber() ?? 0,
    };
  }

  async getSettings(keys: readonly string[]): Promise<Record<string, unknown>> {
    const rows = await this.prisma.appSetting.findMany({ where: { key: { in: [...keys] } } });
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  async setSetting(key: string, value: number): Promise<void> {
    await this.prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  findSampleByScenario(scenarioKey: string) {
    return this.prisma.sampleResult.findUnique({ where: { scenarioKey } });
  }
}
