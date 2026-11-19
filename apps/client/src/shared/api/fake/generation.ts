import {
  JobStageSchema,
  type JobStage,
  type Node,
  type NodeSnapshot,
  type Verification,
  type CreateRevisionResponse,
} from '@tome/shared';
import { FakeFailure } from './errors';

// 서버의 가짜 AI(apps/server/src/ai/mock-ai.provider.ts)와 같은 고정 노드다.
// 화면을 만들 때 서버 없이도 5단계가 같은 모양으로 채워지게 한다.

const PAD_AXES = { xAxis: ['Textured', 'Smooth'], yAxis: ['Horizon', 'Surrounding'] } as const;

const pad = (x: number, y: number) => ({
  x,
  y,
  xAxis: [...PAD_AXES.xAxis] as [string, string],
  yAxis: [...PAD_AXES.yAxis] as [string, string],
});

export const FAKE_SUBJECT_TEMPLATE = '{k1} over {k2}';

const TEXT_NODES: Record<'analyze' | 'research' | 'evidence' | 'draft', readonly Node[]> = {
  analyze: [
    {
      id: 'k1',
      stage: 'analyze',
      kind: 'keyword',
      text: 'lighthouse',
      enabled: true,
      weight: 7,
      pad: pad(0, 0),
      parentIds: [],
      aiInitial: { weight: 7, pad: { x: 0, y: 0 }, enabled: true },
    },
    {
      id: 'k2',
      stage: 'analyze',
      kind: 'keyword',
      text: 'stormy sea',
      enabled: true,
      weight: 5,
      pad: pad(-2, 1),
      parentIds: [],
      aiInitial: { weight: 5, pad: { x: -2, y: 1 }, enabled: true },
    },
  ],
  research: [
    {
      id: 'd1',
      stage: 'research',
      kind: 'dataType',
      text: 'Coastal photography',
      enabled: true,
      parentIds: ['k1'],
    },
    {
      id: 's1',
      stage: 'research',
      kind: 'priority',
      text: 'Light over form',
      enabled: true,
      order: 0,
      parentIds: ['d1'],
      aiInitial: { order: 0 },
    },
  ],
  evidence: [
    {
      id: 'e1',
      stage: 'evidence',
      kind: 'evidence',
      text: 'Lighthouses are usually shot at dusk to show the beam.',
      enabled: true,
      sourceType: 'model_knowledge',
      domain: 'evidence',
      level: 'macro',
      parentIds: ['s1'],
    },
  ],
  draft: [
    {
      id: 'a1',
      stage: 'draft',
      kind: 'attribute',
      text: 'dusk light',
      enabled: true,
      weight: 6,
      category: 'lighting',
      parentIds: ['e1'],
      aiInitial: { weight: 6, enabled: true },
    },
    {
      id: 'a2',
      stage: 'draft',
      kind: 'attribute',
      text: 'rough waves',
      enabled: true,
      weight: 4,
      category: 'environment',
      parentIds: ['e1'],
      aiInitial: { weight: 4, enabled: true },
    },
  ],
};

/** 서버와 같은 단계 순서. 마지막(verify) 뒤에는 다음 단계가 없다. */
export const FAKE_STAGE_ORDER: readonly JobStage[] = JobStageSchema.options;

export function nextStageOf(stage: JobStage): JobStage | null {
  return FAKE_STAGE_ORDER[FAKE_STAGE_ORDER.indexOf(stage) + 1] ?? null;
}

export function isTextStage(stage: JobStage): stage is keyof typeof TEXT_NODES {
  return stage in TEXT_NODES;
}

/** 텍스트 단계(analyze~draft)의 고정 노드. 부를 때마다 새 복사본을 준다. */
export function fakeNodes(stage: keyof typeof TEXT_NODES): Node[] {
  return structuredClone([...TEXT_NODES[stage]]);
}

/** 그림 단계가 만든 답변의 노드 묶음(앞 단계 노드를 모두 담는다). */
export function fakeSnapshot(nodes: readonly Node[]): NodeSnapshot {
  return { schemaVersion: 1, subjectTemplate: FAKE_SUBJECT_TEMPLATE, nodes: [...nodes] };
}

/**
 * 서버 verify.ts 와 같은 규칙: draft 의 켜진 attribute 마다 기준 노드 하나(v1, v2, ...).
 * 측정 전이라 status 는 skipped 다.
 */
export function fakeVerification(nodes: readonly Node[]): Verification {
  const criteria: Node[] = nodes
    .filter((n) => n.stage === 'draft' && n.kind === 'attribute' && n.enabled)
    .map((attribute, index) => ({
      id: `v${index + 1}`,
      stage: 'verify',
      kind: 'criterion',
      text: `The image shows ${attribute.text}.`,
      enabled: true,
      parentIds: [attribute.id],
    }));
  return { status: 'skipped', criteria, mismatches: [] };
}

/**
 * 가짜 그림. 서버는 `/assets/answers/:id/full|thumb` 경로를 주지만, 가짜 응답 모드에는
 * 그 경로를 줄 서버가 없어서 화면에 바로 뜨는 1×1 그림(data 주소)을 준다.
 */
export const FAKE_IMAGE_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => equal(value, b[index]))
    );
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => equal(left[key], right[key]));
}

export function fakeRevisionPlan(
  base: NodeSnapshot,
  requested: NodeSnapshot,
): Pick<CreateRevisionResponse, 'startStage' | 'changes'> {
  const invalid = () => {
    throw new FakeFailure('VALIDATION_FAILED');
  };
  if (
    base.subjectTemplate !== requested.subjectTemplate ||
    base.nodes.length !== requested.nodes.length
  )
    invalid();
  const stages: Partial<
    Record<Node['kind'], Partial<Record<'enabled' | 'weight' | 'pad' | 'order', JobStage>>>
  > = {
    keyword: { enabled: 'assemble', weight: 'assemble', pad: 'assemble' },
    attribute: { enabled: 'assemble', weight: 'assemble' },
    dataType: { enabled: 'evidence' },
    priority: { enabled: 'evidence', order: 'evidence' },
    evidence: { enabled: 'draft' },
  };
  const fixed = [
    'stage',
    'kind',
    'text',
    'parentIds',
    'category',
    'negative',
    'sourceType',
    'domain',
    'level',
    'aiInitial',
  ] as const;
  const changes: CreateRevisionResponse['changes'] = [];
  let startStage: JobStage | undefined;
  for (const next of requested.nodes) {
    const before = base.nodes.find((node) => node.id === next.id);
    if (!before) return invalid();
    if (fixed.some((field) => !equal(before[field], next[field]))) invalid();
    if (
      before.pad &&
      next.pad &&
      !equal([before.pad.xAxis, before.pad.yAxis], [next.pad.xAxis, next.pad.yAxis])
    )
      invalid();
    for (const field of ['enabled', 'weight', 'pad', 'order'] as const) {
      if (equal(before[field], next[field])) continue;
      if ((next.kind === 'criterion' || next.kind === 'mismatch') && field === 'enabled') continue;
      const stage = stages[next.kind]?.[field];
      if (!stage) return invalid();
      changes.push({ nodeId: next.id, field });
      if (!startStage || FAKE_STAGE_ORDER.indexOf(stage) < FAKE_STAGE_ORDER.indexOf(startStage))
        startStage = stage;
    }
  }
  if (!startStage) throw new FakeFailure('NO_CHANGES');
  return { startStage, changes };
}
