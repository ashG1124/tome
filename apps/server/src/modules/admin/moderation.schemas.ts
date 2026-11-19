import { z } from 'zod';

// 관리 API 전용 스키마(서버 안에서만 쓴다).
export const HideRequestSchema = z.object({ hidden: z.boolean() }).strict();
export type HideRequest = z.infer<typeof HideRequestSchema>;

export const PURGE_CONFIRMATION = 'DELETE VISITOR DATA';

export const PurgeVisitorsRequestSchema = z.object({ confirm: z.string() }).strict();
export type PurgeVisitorsRequest = z.infer<typeof PurgeVisitorsRequestSchema>;

export const IdParamSchema = z.string().uuid();
