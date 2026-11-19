// 시드 노드 스냅샷 생성(MockAiProvider 출력과 같은 모양, 프롬프트에 맞게 결정적으로).
import {
  DEFAULT_AXES,
  NodeSnapshotSchema,
  type Node,
  type NodeSnapshot,
  type Verification,
} from '@tome/shared';
import { assemblePrompt, type AssembleResult } from '../modules/generation/assemble';
import type { ProjectSpec } from './specs';

const LIBRARIES = [
  {
    dataTypes: ['Product photography', 'Editorial photography'],
    priorities: ['Light over form', 'Detail over mood'],
    evidence: [
      'Product shots usually rely on soft, even light to show form.',
      'Editorial images pair one strong subject with a quiet background.',
    ],
  },
  {
    dataTypes: ['Interior photography', 'Architectural drawing'],
    priorities: ['Warmth over minimalism', 'Space over decoration'],
    evidence: [
      'Interior photos favor natural window light for warmth.',
      'Wide framing helps show how a room feels to be in.',
    ],
  },
  {
    dataTypes: ['Concept art', 'Street photography'],
    priorities: ['Mood over accuracy', 'Color over detail'],
    evidence: [
      'Concept art leans on a limited palette to set the mood.',
      'Night scenes read best with one dominant light color.',
    ],
  },
  {
    dataTypes: ['Graphic design', 'Illustration'],
    priorities: ['Contrast over subtlety', 'Shape over texture'],
    evidence: [
      'Strong contrast keeps a graphic readable at small sizes.',
      'Simple shapes carry a composition faster than texture.',
    ],
  },
] as const;

const CATEGORIES = ['lighting', 'material', 'composition', 'mood'] as const;
const KEYWORD_WEIGHTS = [8, 6, 5, 4] as const;
const ATTRIBUTE_WEIGHTS = [7, 6, 5, 4] as const;
const KEYWORD_PADS = [
  { x: 0, y: 0 },
  { x: -2, y: 1 },
  { x: 1, y: -1 },
  { x: 2, y: 2 },
] as const;

export const NODE_IDS = {
  evidence: ['d1', 's1', 'e1', 'd2', 's2', 'e2'],
  intuitive: ['k1', 'a1', 'k2', 'a2', 'k3', 'a3', 'k4', 'a4'],
} as const;

/** 모든 시드 답변에 붙는 검증 결과(criterion v1·v2, mismatch m1). */
export const SEED_VERIFICATION: Verification = {
  status: 'done',
  criteria: [
    {
      id: 'v1',
      stage: 'verify',
      kind: 'criterion',
      text: 'Main subject is clearly visible',
      enabled: true,
      parentIds: [],
    },
    {
      id: 'v2',
      stage: 'verify',
      kind: 'criterion',
      text: 'Style matches the prompt',
      enabled: true,
      parentIds: [],
    },
  ],
  mismatches: [
    {
      id: 'm1',
      stage: 'verify',
      kind: 'mismatch',
      text: 'Background feels busier than requested',
      enabled: true,
      parentIds: ['v1'],
    },
  ],
};

/** 버전 version(0=AI 첫 결과) 의 노드. 버전이 오를수록 사용자가 값을 몇 개 바꾼 모양이다. */
export function buildNodes(spec: ProjectSpec, libraryIndex: number, version: number): NodeSnapshot {
  const lib = LIBRARIES[libraryIndex % LIBRARIES.length]!;
  const nodes: Node[] = [];
  spec.keywords.forEach((text, i) => {
    const aiWeight = KEYWORD_WEIGHTS[i]!;
    const aiPad = KEYWORD_PADS[i]!;
    let weight: number = aiWeight;
    let pad: { x: number; y: number } = aiPad;
    if (version >= 1 && i === 0) weight = Math.min(9, aiWeight + 1 + version);
    if (version >= 1 && i === 1)
      pad = { x: Math.max(-5, aiPad.x - version), y: Math.min(5, aiPad.y + version) };
    nodes.push({
      id: `k${i + 1}`,
      stage: 'analyze',
      kind: 'keyword',
      text,
      enabled: true,
      weight,
      pad: { ...pad, xAxis: [...DEFAULT_AXES.xAxis], yAxis: [...DEFAULT_AXES.yAxis] },
      parentIds: [],
      aiInitial: { weight: aiWeight, pad: { ...aiPad }, enabled: true },
    });
  });
  lib.dataTypes.forEach((text, i) => {
    nodes.push({
      id: `d${i + 1}`,
      stage: 'research',
      kind: 'dataType',
      text,
      enabled: true,
      parentIds: [`k${i + 1}`],
    });
  });
  lib.priorities.forEach((text, i) => {
    nodes.push({
      id: `s${i + 1}`,
      stage: 'research',
      kind: 'priority',
      text,
      enabled: true,
      order: i,
      parentIds: [`d${i + 1}`],
      aiInitial: { order: i },
    });
  });
  lib.evidence.forEach((text, i) => {
    nodes.push({
      id: `e${i + 1}`,
      stage: 'evidence',
      kind: 'evidence',
      text,
      enabled: true,
      sourceType: 'model_knowledge',
      domain: 'evidence',
      level: i === 0 ? 'macro' : 'micro',
      parentIds: [`s${i + 1}`],
    });
  });
  spec.attributes.forEach((text, i) => {
    const aiWeight = ATTRIBUTE_WEIGHTS[i]!;
    let weight: number = aiWeight;
    if (version >= 1 && i === 0) weight = Math.max(1, aiWeight - version);
    if (version >= 2 && i === 2) weight = Math.min(9, aiWeight + 2);
    nodes.push({
      id: `a${i + 1}`,
      stage: 'draft',
      kind: 'attribute',
      text,
      enabled: true,
      weight,
      category: CATEGORIES[i]!,
      parentIds: [i < 2 ? 'e1' : 'e2'],
      aiInitial: { weight: aiWeight, enabled: true },
    });
  });
  return NodeSnapshotSchema.parse({ schemaVersion: 1, subjectTemplate: spec.subject, nodes });
}

export function assembleFor(snapshot: NodeSnapshot): AssembleResult {
  return assemblePrompt(snapshot.subjectTemplate, snapshot.nodes);
}
