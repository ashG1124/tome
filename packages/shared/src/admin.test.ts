import { describe, expect, it } from 'vitest';
import {
  AdminResetRequestSchema,
  AdminResetResponseSchema,
  AdminSettingsRequestSchema,
  AdminSettingsResponseSchema,
  AdminUsageResponseSchema,
} from './admin.js';

const totals = { textCalls: 4, imageCount: 1, fallbackCount: 0, neuronsEst: 12.5, costUsdEst: 0 };

describe('admin usage schemas', () => {
  it('accepts a usage response', () => {
    const parsed = AdminUsageResponseSchema.safeParse({
      today: { date: '2026-11-17', ...totals },
      month: { month: '2026-11', ...totals },
      caps: { dailyNeuronCap: 50000, monthlyCostCapUsd: 20 },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a malformed date', () => {
    const parsed = AdminUsageResponseSchema.safeParse({
      today: { date: '11/17', ...totals },
      month: { month: '2026-11', ...totals },
      caps: { dailyNeuronCap: 50000, monthlyCostCapUsd: 20 },
    });
    expect(parsed.success).toBe(false);
  });

  it('settings request: partial, positive numbers only', () => {
    expect(AdminSettingsRequestSchema.safeParse({}).success).toBe(true);
    expect(AdminSettingsRequestSchema.safeParse({ dailyNeuronCap: 100 }).success).toBe(true);
    expect(AdminSettingsRequestSchema.safeParse({ dailyNeuronCap: 0 }).success).toBe(false);
    expect(AdminSettingsRequestSchema.safeParse({ monthlyCostCapUsd: -1 }).success).toBe(false);
    expect(AdminSettingsRequestSchema.safeParse({ monthlyCostCapUsd: 'x' }).success).toBe(false);
  });

  it('settings response wraps both caps', () => {
    const parsed = AdminSettingsResponseSchema.safeParse({
      settings: { dailyNeuronCap: 1, monthlyCostCapUsd: 2 },
    });
    expect(parsed.success).toBe(true);
  });
});

describe('admin reset schemas', () => {
  it('request accepts only the three scopes', () => {
    for (const scope of ['persona', 'visitor', 'all-nonseed']) {
      expect(AdminResetRequestSchema.safeParse({ scope }).success).toBe(true);
    }
    expect(AdminResetRequestSchema.safeParse({ scope: 'seed' }).success).toBe(false);
    expect(AdminResetRequestSchema.safeParse({}).success).toBe(false);
  });

  it('response needs non-negative integers', () => {
    expect(AdminResetResponseSchema.safeParse({ deleted: 3, ms: 120 }).success).toBe(true);
    expect(AdminResetResponseSchema.safeParse({ deleted: -1, ms: 0 }).success).toBe(false);
    expect(AdminResetResponseSchema.safeParse({ deleted: 1.5, ms: 0 }).success).toBe(false);
  });
});
