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

// 아이덴티티 계산이 읽는 필드. 전부 선택이고 모르는 키는 그대로 통과한다(화면이 점차 채워 보낸다).
const NodeIdFieldSchema = z.string().max(32).optional(); // 건드린 노드 id (k1·d2·s1·e1·a1 …)
const ReasonFieldSchema = z.string().max(300).optional(); // 사용자가 남긴 이유(빈 문자열 = 이유 없음)
const PadPointSchema = z.object({ x: z.number(), y: z.number() }); // 의미 패드 좌표(−5~+5)

const weightFields = {
  nodeId: NodeIdFieldSchema,
  weightAi: z.number().optional(), // AI 초기 가중치
  weightFinal: z.number().optional(), // 사용자가 정한 가중치
  reason: ReasonFieldSchema,
};

export const WeightDialClickPayloadSchema = z.looseObject(weightFields);
export const MeaningPointSetPayloadSchema = z.looseObject({
  nodeId: NodeIdFieldSchema,
  padAi: PadPointSchema.optional(), // AI 초기 패드 좌표
  padFinal: PadPointSchema.optional(), // 사용자가 정한 패드 좌표
});
export const PriorityDragReorderPayloadSchema = z.looseObject({
  nodeId: NodeIdFieldSchema,
  orderChanged: z.boolean().optional(), // 순서가 실제로 바뀌었는가
  orderDelta: z.number().min(0).optional(), // 순서 변동 크기(자리 수 합)
  n: z.number().min(1).optional(), // 비교한 우선순위 노드 수
});
export const WeightApplyPayloadSchema = z.looseObject(weightFields);
export const SourceApplyPayloadSchema = z.looseObject({
  nodeId: NodeIdFieldSchema,
  reason: ReasonFieldSchema,
});
export const PriorityApplyPayloadSchema = z.looseObject({
  nodeId: NodeIdFieldSchema,
  reason: ReasonFieldSchema,
});
export const DraftApplyPayloadSchema = z.looseObject({
  nodeId: NodeIdFieldSchema,
  changed: z.boolean().optional(), // AI 초안에서 값을 바꾸고 확정했는가
  reason: ReasonFieldSchema,
});
export const EvidenceTogglePayloadSchema = z.looseObject({
  nodeId: NodeIdFieldSchema,
  enabled: z.boolean().optional(), // 토글 뒤 켜짐 여부
});
export const FlagDecisionPayloadSchema = z.looseObject({
  nodeId: NodeIdFieldSchema,
  state: z.enum(['kept', 'removed']).optional(), // 불일치 표시에 대한 결정
  reason: ReasonFieldSchema,
});
export const NodeOpenPayloadSchema = z.looseObject({ nodeId: NodeIdFieldSchema });

export const EventPayloadSchemas = {
  page_add: GenericPayloadSchema,
  page_switch: GenericPayloadSchema,
  prompt_submit: z.object({
    presetKey: PresetKeySchema.optional(),
    hasAttachment: z.boolean(),
  }),
  canvas_revealed: GenericPayloadSchema,
  node_open: NodeOpenPayloadSchema,
  node_close: GenericPayloadSchema,
  weight_dial_click: WeightDialClickPayloadSchema,
  meaning_point_set: MeaningPointSetPayloadSchema,
  weight_apply: WeightApplyPayloadSchema,
  priority_drag_reorder: PriorityDragReorderPayloadSchema,
  source_apply: SourceApplyPayloadSchema,
  priority_apply: PriorityApplyPayloadSchema,
  evidence_toggle: EvidenceTogglePayloadSchema,
  draft_apply: DraftApplyPayloadSchema,
  verify_toggle: GenericPayloadSchema,
  flag_decision: FlagDecisionPayloadSchema,
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
