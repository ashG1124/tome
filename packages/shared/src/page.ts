import { z } from 'zod';
import { IdSchema, LIMITS } from './common.js';

export const PageSchema = z.object({
  id: IdSchema,
  index: z
    .number()
    .int()
    .min(0)
    .max(LIMITS.PAGES_MAX - 1),
});
export type Page = z.infer<typeof PageSchema>;

export const PageWithCountSchema = PageSchema.extend({
  setCount: z.number().int().min(0).max(LIMITS.SETS_PER_PAGE),
});
export type PageWithCount = z.infer<typeof PageWithCountSchema>;

export const CreatePageResponseSchema = z.object({
  page: PageSchema,
});
export type CreatePageResponse = z.infer<typeof CreatePageResponseSchema>;
