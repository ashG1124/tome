import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_LIMITS,
  AttachmentSchema,
  CreateAttachmentResponseSchema,
} from './attachment.js';
import { ID_A } from './testing/fixtures.js';

const attachment = { id: ID_A, thumbUrl: '/t', width: 512, height: 384 };

describe('attachment schemas', () => {
  it('parses an attachment', () => {
    expect(AttachmentSchema.safeParse(attachment).success).toBe(true);
    expect(CreateAttachmentResponseSchema.safeParse({ attachment }).success).toBe(true);
  });

  it('rejects zero or fractional dimensions', () => {
    expect(AttachmentSchema.safeParse({ ...attachment, width: 0 }).success).toBe(false);
    expect(AttachmentSchema.safeParse({ ...attachment, height: 1.5 }).success).toBe(false);
  });

  it('exposes the upload limits', () => {
    expect(ATTACHMENT_LIMITS.MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(ATTACHMENT_LIMITS.MIME_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });
});
