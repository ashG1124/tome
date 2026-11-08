import { Injectable } from '@nestjs/common';
import type { Node } from '@tome/shared';
import type { AiImage, AiProvider } from './ai-provider';

// 1x1 PNG 고정 이미지
const MOCK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const PAD_AXES = { xAxis: ['Textured', 'Smooth'], yAxis: ['Horizon', 'Surrounding'] } as const;

const ANALYZE_NODES: Node[] = [
  {
    id: 'k1',
    stage: 'analyze',
    kind: 'keyword',
    text: 'lighthouse',
    enabled: true,
    weight: 7,
    pad: { x: 0, y: 0, xAxis: [...PAD_AXES.xAxis], yAxis: [...PAD_AXES.yAxis] },
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
    pad: { x: -2, y: 1, xAxis: [...PAD_AXES.xAxis], yAxis: [...PAD_AXES.yAxis] },
    parentIds: [],
    aiInitial: { weight: 5, pad: { x: -2, y: 1 }, enabled: true },
  },
];

const RESEARCH_NODES: Node[] = [
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
];

const EVIDENCE_NODES: Node[] = [
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
];

const DRAFT_NODES: Node[] = [
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
];

/** 고정 노드·고정 이미지를 돌려준다. 네트워크 호출과 비용이 없다. */
@Injectable()
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';

  analyze(): Promise<Node[]> {
    return Promise.resolve(structuredClone(ANALYZE_NODES));
  }

  research(): Promise<Node[]> {
    return Promise.resolve(structuredClone(RESEARCH_NODES));
  }

  evidence(): Promise<Node[]> {
    return Promise.resolve(structuredClone(EVIDENCE_NODES));
  }

  draft(): Promise<Node[]> {
    return Promise.resolve(structuredClone(DRAFT_NODES));
  }

  image(): Promise<AiImage> {
    return Promise.resolve({
      mimeType: 'image/png',
      bytes: new Uint8Array(Buffer.from(MOCK_PNG_BASE64, 'base64')),
    });
  }
}
