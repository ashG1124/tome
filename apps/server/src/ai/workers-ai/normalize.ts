import { DEFAULT_AXES, type Node, NodeSchema } from '@tome/shared';
import type { z } from 'zod';
import {
  RawAnalyzeSchema,
  RawDraftSchema,
  RawEvidenceSchema,
  RawResearchSchema,
} from './raw-schemas';

export type TextStage = 'analyze' | 'research' | 'evidence' | 'draft';

/** 모델 출력이 규칙을 어긴 경우(파싱·스키마·의미). */
export class OutputViolation extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'OutputViolation';
  }
}

export interface Evaluated {
  nodes: Node[];
  /** analyze 만: 새 id 로 다시 쓴 subject 틀 */
  subjectTemplate?: string;
  /** 틀린 축 이름을 기본 축으로 바꾼 개수. 0 보다 크면 "축 이름만 틀린" 출력이다. */
  axisFixes: number;
}

const DEFAULT_WEIGHT = 5;
const AXIS_NAME = /^[A-Za-z][A-Za-z -]{0,29}$/;
const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const NEGATIVE = /^(no|without)\b/i;
const SUBJECT_MAX = 200;

function parseRaw<S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new OutputViolation('schema');
  return result.data;
}

function hasHangul(value: unknown): boolean {
  if (typeof value === 'string') return HANGUL.test(value);
  if (Array.isArray(value)) return value.some(hasHangul);
  if (value !== null && typeof value === 'object') return Object.values(value).some(hasHangul);
  return false;
}

const clean = (value: string): string => value.trim();

/** 앞 단계에 있는 id 만 남긴다(중복 제거). 하나도 안 남으면 의미 위반. */
function keepParents(raw: readonly string[], allowed: ReadonlySet<string>): string[] {
  const kept = [...new Set(raw.map(clean).filter((id) => allowed.has(id)))];
  if (kept.length === 0) throw new OutputViolation('no valid parent');
  return kept;
}

const idsOf = (prior: readonly Node[], kinds: readonly Node['kind'][]): Set<string> =>
  new Set(prior.filter((n) => kinds.includes(n.kind)).map((n) => n.id));

/** 축 한 쌍이 규칙에 맞으면 그대로, 아니면 null. */
function validAxis(axis: readonly string[] | undefined): [string, string] | null {
  if (!axis || axis.length !== 2) return null;
  const [a, b] = axis.map((s) => s.trim());
  return a !== undefined && b !== undefined && AXIS_NAME.test(a) && AXIS_NAME.test(b)
    ? [a, b]
    : null;
}

function evaluateAnalyze(raw: unknown): Evaluated {
  const parsed = parseRaw(RawAnalyzeSchema, raw);
  const rawIds = parsed.keywords.map((k) => k.id.trim());
  if (new Set(rawIds).size !== rawIds.length) throw new OutputViolation('duplicate id');
  const newIdOf = new Map(rawIds.map((id, i) => [id, `k${i + 1}`]));
  const textOf = new Map(rawIds.map((id, i) => [id, clean(parsed.keywords[i]!.text)]));
  if ([...textOf.values()].some((t) => t === '')) throw new OutputViolation('empty text');

  // subject 틀: 모든 keyword id 가 정확히 한 번, 그 밖의 자리표시는 없어야 한다.
  const seen = new Map<string, number>();
  const subjectTemplate = parsed.subject_template.replace(
    /\{([^{}]*)\}/g,
    (_match, rawId: string) => {
      const id = rawId.trim();
      seen.set(id, (seen.get(id) ?? 0) + 1);
      return newIdOf.has(id) ? `{${newIdOf.get(id)!}}` : '{?}';
    },
  );
  for (const id of seen.keys())
    if (!newIdOf.has(id)) throw new OutputViolation('unknown placeholder');
  for (const id of rawIds) {
    if (seen.get(id) !== 1) throw new OutputViolation('placeholder count');
  }
  const filled = parsed.subject_template.replace(
    /\{([^{}]*)\}/g,
    (_m, rawId: string) => textOf.get(rawId.trim()) ?? '',
  );
  if (filled.trim().length === 0 || filled.length > SUBJECT_MAX) {
    throw new OutputViolation('subject length');
  }

  let axisFixes = 0;
  const nodes = parsed.keywords.map((kw, i): Node => {
    const text = textOf.get(rawIds[i]!)!;
    const weight = kw.weight ?? DEFAULT_WEIGHT;
    const x = kw.pad?.x ?? 0;
    const y = kw.pad?.y ?? 0;
    let xAxis = validAxis(kw.pad?.xAxis);
    let yAxis = validAxis(kw.pad?.yAxis);
    if (!xAxis) {
      xAxis = [...DEFAULT_AXES.xAxis];
      axisFixes += 1;
    }
    if (!yAxis) {
      yAxis = [...DEFAULT_AXES.yAxis];
      axisFixes += 1;
    }
    return {
      id: `k${i + 1}`,
      stage: 'analyze',
      kind: 'keyword',
      text,
      enabled: true,
      weight,
      pad: { x, y, xAxis, yAxis },
      negative: NEGATIVE.test(text),
      parentIds: [],
      domain: 'intuitive',
      level: 'macro',
      aiInitial: { weight, pad: { x, y }, enabled: true },
    };
  });
  return { nodes, subjectTemplate, axisFixes };
}

function evaluateResearch(raw: unknown, prior: readonly Node[]): Evaluated {
  const parsed = parseRaw(RawResearchSchema, raw);
  const keywordIds = idsOf(prior, ['keyword']);
  const dataTypes = parsed.data_types.map((t, i): Node => ({
    id: `d${i + 1}`,
    stage: 'research',
    kind: 'dataType',
    text: clean(t),
    enabled: true,
    parentIds: [],
    domain: 'evidence',
    level: 'macro',
  }));
  const priorities = parsed.priorities.map((p, i): Node => ({
    id: `s${i + 1}`,
    stage: 'research',
    kind: 'priority',
    text: clean(p.text),
    enabled: true,
    order: i,
    parentIds: keepParents(p.parent_ids, keywordIds),
    domain: 'evidence',
    level: 'micro',
    aiInitial: { order: i },
  }));
  return { nodes: [...dataTypes, ...priorities], axisFixes: 0 };
}

function evaluateEvidence(raw: unknown, prior: readonly Node[]): Evaluated {
  const parsed = parseRaw(RawEvidenceSchema, raw);
  const allowed = idsOf(prior, ['keyword', 'priority']);
  const nodes = parsed.evidence.map((e, i): Node => ({
    id: `e${i + 1}`,
    stage: 'evidence',
    kind: 'evidence',
    text: clean(e.text),
    enabled: true,
    parentIds: keepParents(e.parent_ids, allowed),
    sourceType: 'model_knowledge',
    domain: 'evidence',
    level: 'micro',
  }));
  return { nodes, axisFixes: 0 };
}

function evaluateDraft(raw: unknown, prior: readonly Node[]): Evaluated {
  const parsed = parseRaw(RawDraftSchema, raw);
  const allowed = idsOf(prior, ['evidence']);
  const nodes = parsed.attributes.map((a, i): Node => {
    const weight = a.weight ?? DEFAULT_WEIGHT;
    return {
      id: `a${i + 1}`,
      stage: 'draft',
      kind: 'attribute',
      text: clean(a.text),
      enabled: true,
      weight,
      category: clean(a.category),
      parentIds: keepParents(a.parent_ids, allowed),
      domain: 'intuitive',
      level: 'micro',
      aiInitial: { weight, enabled: true },
    };
  });
  return { nodes, axisFixes: 0 };
}

/**
 * 모델 원시 출력을 검사하고 shared Node[] 로 바꾼다.
 * 규칙을 어기면 OutputViolation 을 던진다(축 이름만 틀린 경우는 던지지 않고 axisFixes 로 알린다).
 */
export function evaluateStage(stage: TextStage, raw: unknown, prior: readonly Node[]): Evaluated {
  if (hasHangul(raw)) throw new OutputViolation('hangul');
  const result =
    stage === 'analyze'
      ? evaluateAnalyze(raw)
      : stage === 'research'
        ? evaluateResearch(raw, prior)
        : stage === 'evidence'
          ? evaluateEvidence(raw, prior)
          : evaluateDraft(raw, prior);
  if (result.nodes.length === 0) throw new OutputViolation('no nodes');
  for (const node of result.nodes) {
    if (!NodeSchema.safeParse(node).success || node.text === '') {
      throw new OutputViolation('node shape');
    }
  }
  return result;
}
