import { z } from 'zod';
import { LIMITS } from './common.js';

export const JobStageSchema = z.enum([
  'analyze',
  'research',
  'evidence',
  'draft',
  'assemble',
  'image',
  'verify',
]);
export type JobStage = z.infer<typeof JobStageSchema>;

export const NodeStageSchema = z.enum(['analyze', 'research', 'evidence', 'draft', 'verify']);
export type NodeStage = z.infer<typeof NodeStageSchema>;

export const NodeKindSchema = z.enum([
  'keyword',
  'dataType',
  'priority',
  'evidence',
  'attribute',
  'criterion',
  'mismatch',
]);
export type NodeKind = z.infer<typeof NodeKindSchema>;

export const DEFAULT_AXES = {
  xAxis: ['Textured', 'Smooth'],
  yAxis: ['Horizon', 'Surrounding'],
} as const;

export const NodeIdSchema = z.string().regex(/^[kdseavm]\d+$/);
const WeightSchema = z.number().int().min(LIMITS.WEIGHT_MIN).max(LIMITS.WEIGHT_MAX);
const PadCoordSchema = z.number().int().min(LIMITS.PAD_MIN).max(LIMITS.PAD_MAX);
const AxisNameSchema = z.string().regex(/^[A-Za-z][A-Za-z -]{0,29}$/);
const AxisPairSchema = z.tuple([AxisNameSchema, AxisNameSchema]);
const OrderSchema = z.number().int().min(0);

export const PadSchema = z.object({
  x: PadCoordSchema,
  y: PadCoordSchema,
  xAxis: AxisPairSchema,
  yAxis: AxisPairSchema,
});
export type Pad = z.infer<typeof PadSchema>;

export const NodeSchema = z.object({
  id: NodeIdSchema,
  stage: NodeStageSchema,
  kind: NodeKindSchema,
  text: z.string(),
  enabled: z.boolean(),
  weight: WeightSchema.optional(),
  pad: PadSchema.optional(),
  order: OrderSchema.optional(),
  category: z.string().optional(),
  negative: z.boolean().optional(),
  parentIds: z.array(NodeIdSchema),
  sourceType: z.literal('model_knowledge').optional(),
  domain: z.enum(['intuitive', 'evidence']).optional(),
  level: z.enum(['macro', 'micro']).optional(),
  aiInitial: z
    .object({
      weight: WeightSchema.optional(),
      pad: PadSchema.pick({ x: true, y: true }).optional(),
      enabled: z.boolean().optional(),
      order: OrderSchema.optional(),
    })
    .optional(),
});
export type Node = z.infer<typeof NodeSchema>;

export const NodeSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    subjectTemplate: z.string().min(1),
    nodes: z.array(NodeSchema),
  })
  .refine((snap) => new Set(snap.nodes.map((n) => n.id)).size === snap.nodes.length, {
    message: 'Node ids must be unique',
    path: ['nodes'],
  });
export type NodeSnapshot = z.infer<typeof NodeSnapshotSchema>;

export const VerificationSchema = z.object({
  status: z.enum(['done', 'skipped', 'failed']),
  criteria: z.array(NodeSchema),
  mismatches: z.array(NodeSchema),
});
export type Verification = z.infer<typeof VerificationSchema>;

export const PhrasesSchema = z.record(NodeIdSchema, z.string());
export type Phrases = z.infer<typeof PhrasesSchema>;

export const ExcludedSchema = z.array(
  z.object({
    id: NodeIdSchema,
    reason: z.enum(['off', 'weight0', 'evidence-excluded', 'length']),
  }),
);
export type Excluded = z.infer<typeof ExcludedSchema>;
