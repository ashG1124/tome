import { z } from 'zod';
import { IdSchema } from './common.js';

export const ATTACHMENT_LIMITS = {
  MAX_BYTES: 10 * 1024 * 1024,
  MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  PER_SET: 1,
} as const;

export const AttachmentSchema = z.object({
  id: IdSchema,
  thumbUrl: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const CreateAttachmentResponseSchema = z.object({
  attachment: AttachmentSchema,
});
export type CreateAttachmentResponse = z.infer<typeof CreateAttachmentResponseSchema>;
