import { z } from 'zod';

/**
 * LLM 원시 출력 스키마(서버 전용). 두 벌이다.
 * - JSON Schema: 요청의 response_format 에 넣는다(모델이 따르도록).
 * - zod: 받은 출력을 검사한다. 누락돼도 기본값이 있는 항목(weight·pad.x·pad.y)과
 *   축 이름은 여기서 느슨하게 받고 normalize.ts 에서 따로 다룬다.
 */

const stringSchema = (min: number, max: number) => ({
  type: 'string',
  minLength: min,
  maxLength: max,
});
const intSchema = (min: number, max: number) => ({ type: 'integer', minimum: min, maximum: max });
const idsSchema = { type: 'array', minItems: 1, items: { type: 'string' } };
const axisSchema = { type: 'array', minItems: 2, maxItems: 2, items: stringSchema(1, 30) };

export const JSON_SCHEMAS = {
  analyze: {
    type: 'object',
    additionalProperties: false,
    required: ['subject_template', 'keywords'],
    properties: {
      subject_template: stringSchema(1, 400),
      keywords: {
        type: 'array',
        minItems: 3,
        maxItems: 6,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'text', 'weight', 'pad'],
          properties: {
            id: { type: 'string' },
            text: stringSchema(1, 60),
            weight: intSchema(0, 9),
            pad: {
              type: 'object',
              additionalProperties: false,
              required: ['x', 'y', 'xAxis', 'yAxis'],
              properties: {
                x: intSchema(-5, 5),
                y: intSchema(-5, 5),
                xAxis: axisSchema,
                yAxis: axisSchema,
              },
            },
          },
        },
      },
    },
  },
  research: {
    type: 'object',
    additionalProperties: false,
    required: ['data_types', 'priorities'],
    properties: {
      data_types: { type: 'array', minItems: 1, maxItems: 3, items: stringSchema(1, 40) },
      priorities: {
        type: 'array',
        minItems: 2,
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'text', 'parent_ids'],
          properties: {
            id: { type: 'string' },
            text: stringSchema(1, 80),
            parent_ids: idsSchema,
          },
        },
      },
    },
  },
  evidence: {
    type: 'object',
    additionalProperties: false,
    required: ['evidence'],
    properties: {
      evidence: {
        type: 'array',
        minItems: 2,
        maxItems: 6,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'text', 'parent_ids', 'source_type'],
          properties: {
            id: { type: 'string' },
            text: stringSchema(1, 160),
            parent_ids: idsSchema,
            source_type: { type: 'string', const: 'model_knowledge' },
          },
        },
      },
    },
  },
  draft: {
    type: 'object',
    additionalProperties: false,
    required: ['attributes'],
    properties: {
      attributes: {
        type: 'array',
        minItems: 3,
        maxItems: 8,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'category', 'text', 'weight', 'parent_ids'],
          properties: {
            id: { type: 'string' },
            category: stringSchema(1, 30),
            text: stringSchema(1, 60),
            weight: intSchema(0, 9),
            parent_ids: idsSchema,
          },
        },
      },
    },
  },
} as const;

const int = (min: number, max: number) => z.number().int().min(min).max(max);
const text = (max: number) => z.string().min(1).max(max);
const parentIds = z.array(z.string()).min(1);

export const RawAnalyzeSchema = z.object({
  subject_template: z.string().min(1).max(400),
  keywords: z
    .array(
      z.object({
        id: z.string().min(1),
        text: text(60),
        weight: int(0, 9).optional(),
        pad: z
          .object({
            x: int(-5, 5).optional(),
            y: int(-5, 5).optional(),
            // 축 이름은 normalize.ts 에서 규칙(정규식)으로 따로 검사한다.
            xAxis: z.array(z.string()).optional(),
            yAxis: z.array(z.string()).optional(),
          })
          .optional(),
      }),
    )
    .min(3)
    .max(6),
});

export const RawResearchSchema = z.object({
  data_types: z.array(text(40)).min(1).max(3),
  priorities: z
    .array(z.object({ id: z.string().min(1), text: text(80), parent_ids: parentIds }))
    .min(2)
    .max(5),
});

export const RawEvidenceSchema = z.object({
  evidence: z
    .array(z.object({ id: z.string().min(1), text: text(160), parent_ids: parentIds }))
    .min(2)
    .max(6),
});

export const RawDraftSchema = z.object({
  attributes: z
    .array(
      z.object({
        id: z.string().min(1),
        category: text(30),
        text: text(60),
        weight: int(0, 9).optional(),
        parent_ids: parentIds,
      }),
    )
    .min(3)
    .max(8),
});
