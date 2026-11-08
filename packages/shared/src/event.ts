import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, LIMITS } from './common.js';
import { PresetKeySchema } from './presets.js';

export const ClientEventTypeSchema = z.enum([
  'page_add',
  'page_switch',
  'prompt_submit',
  'canvas_revealed',
  'node_open',
  'node_close',
  'weight_dial_click',
  'meaning_point_set',
  'weight_apply',
  'priority_drag_reorder',
  'source_apply',
  'priority_apply',
  'evidence_toggle',
  'draft_apply',
  'verify_toggle',
  'flag_decision',
  'version_nav',
  'connection_view',
]);
export type ClientEventType = z.infer<typeof ClientEventTypeSchema>;

export const ServerEventTypeSchema = z.enum([
  'version_save',
  'pin_toggle',
  'comment_add',
  'remix_partner_select',
  'connection_apply',
  'connection_dismiss',
  'derive_start',
  'project_finish',
  'project_post',
  'project_view',
]);
export type ServerEventType = z.infer<typeof ServerEventTypeSchema>;

export const EventTypeSchema = z.enum([
  ...ClientEventTypeSchema.options,
  ...ServerEventTypeSchema.options,
]);
export type EventType = z.infer<typeof EventTypeSchema>;

const GenericPayloadSchema = z.record(z.string(), z.unknown());

export const EventPayloadSchemas = {
  page_add: GenericPayloadSchema,
  page_switch: GenericPayloadSchema,
  prompt_submit: z.object({
    presetKey: PresetKeySchema.optional(),
    hasAttachment: z.boolean(),
  }),
  canvas_revealed: GenericPayloadSchema,
  node_open: GenericPayloadSchema,
  node_close: GenericPayloadSchema,
  weight_dial_click: GenericPayloadSchema,
  meaning_point_set: GenericPayloadSchema,
  weight_apply: GenericPayloadSchema,
  priority_drag_reorder: GenericPayloadSchema,
  source_apply: GenericPayloadSchema,
  priority_apply: GenericPayloadSchema,
  evidence_toggle: GenericPayloadSchema,
  draft_apply: GenericPayloadSchema,
  verify_toggle: GenericPayloadSchema,
  flag_decision: GenericPayloadSchema,
  version_nav: GenericPayloadSchema,
  connection_view: GenericPayloadSchema,
  version_save: GenericPayloadSchema,
  pin_toggle: GenericPayloadSchema,
  comment_add: GenericPayloadSchema,
  remix_partner_select: GenericPayloadSchema,
  connection_apply: GenericPayloadSchema,
  connection_dismiss: GenericPayloadSchema,
  derive_start: GenericPayloadSchema,
  project_finish: GenericPayloadSchema,
  project_post: GenericPayloadSchema,
  project_view: GenericPayloadSchema,
} satisfies Record<EventType, z.ZodType>;

export const EventEnvelopeSchema = z
  .object({
    id: IdSchema,
    schemaVersion: z.literal(1),
    type: EventTypeSchema,
    projectId: IdSchema.optional(),
    setId: IdSchema.optional(),
    answerId: IdSchema.optional(),
    clientTs: IsoDateTimeSchema,
    payload: GenericPayloadSchema,
  })
  .superRefine((event, ctx) => {
    const result = EventPayloadSchemas[event.type].safeParse(event.payload);
    if (result.success) return;
    for (const issue of result.error.issues) {
      ctx.addIssue({ code: 'custom', message: issue.message, path: ['payload', ...issue.path] });
    }
  });
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export const EventBatchRequestSchema = z.object({
  events: z.array(EventEnvelopeSchema).max(LIMITS.EVENT_BATCH_MAX),
});
export type EventBatchRequest = z.infer<typeof EventBatchRequestSchema>;

export const EventBatchResponseSchema = z.object({
  accepted: z.number().int().min(0),
  duplicates: z.number().int().min(0),
});
export type EventBatchResponse = z.infer<typeof EventBatchResponseSchema>;
