import { z } from 'zod';

/** 관리자가 보는 사용량 한 묶음(하루 한 행 또는 한 달 합계). */
const UsageTotalsShape = {
  textCalls: z.number().int().min(0),
  imageCount: z.number().int().min(0),
  fallbackCount: z.number().int().min(0),
  neuronsEst: z.number().min(0),
  costUsdEst: z.number().min(0),
};

export const AdminUsageDaySchema = z.object({
  /** UTC 날짜(YYYY-MM-DD) */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ...UsageTotalsShape,
});
export type AdminUsageDay = z.infer<typeof AdminUsageDaySchema>;

export const AdminUsageMonthSchema = z.object({
  /** UTC 달(YYYY-MM) */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  ...UsageTotalsShape,
});
export type AdminUsageMonth = z.infer<typeof AdminUsageMonthSchema>;

export const UsageCapsSchema = z.object({
  dailyNeuronCap: z.number().positive(),
  monthlyCostCapUsd: z.number().positive(),
});
export type UsageCaps = z.infer<typeof UsageCapsSchema>;

export const AdminUsageResponseSchema = z.object({
  today: AdminUsageDaySchema,
  month: AdminUsageMonthSchema,
  caps: UsageCapsSchema,
});
export type AdminUsageResponse = z.infer<typeof AdminUsageResponseSchema>;

export const AdminSettingsRequestSchema = z.object({
  dailyNeuronCap: z.number().positive().finite().optional(),
  monthlyCostCapUsd: z.number().positive().finite().optional(),
});
export type AdminSettingsRequest = z.infer<typeof AdminSettingsRequestSchema>;

export const AdminSettingsResponseSchema = z.object({ settings: UsageCapsSchema });
export type AdminSettingsResponse = z.infer<typeof AdminSettingsResponseSchema>;
