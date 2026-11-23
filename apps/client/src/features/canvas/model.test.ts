import { describe, expect, it } from 'vitest';
import type { Node, PromptSet } from '@tome/shared';
import {
  buildCanvas,
  keyboardTarget,
  visibleStage,
  sameCardData,
  type CanvasGeometry,
  type CanvasLabels,
  type GenerationView,
} from './model';

const labels: CanvasLabels = {
  title: 'Canvas',
  prompt: 'Prompt',
  stages: {
    analyze: 'Question analysis',
    research: 'Search',
    evidence: 'Evidence',
    draft: 'Draft',
    verify: 'Verification',
  },
  answer: (number) => `Answer ${number}`,
  step: (number) => `Step ${number}`,
  modelKnowledge: 'Model knowledge',
  generating: 'Generating',
  pending: 'Pending',
  skipped: 'Skipped',
  retry: 'Retry',
  failed: 'Failed',
  fit: 'Fit',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  instructions: 'Arrow keys',
};
const geometry: CanvasGeometry = {
  nodeWidth: 300,
  nodeHeight: 62,
  answerWidth: 440,
  columnGap: 80,
  rowGap: 24,
  setGap: 120,
  headerHeight: 48,
};
const keyword: Node = {
  id: 'k1',
  stage: 'analyze',
  kind: 'keyword',
  text: 'Lamp',
  parentIds: [],
  enabled: true,
};
const set: PromptSet = {
  id: 'set-a',
  position: 1,
  prompt: 'A lamp',
  latestAnswer: null,
  answers: [],
};
const generation: GenerationView = {
  setId: set.id,
  job: {
    id: 'job-a',
    setId: set.id,
    pageId: 'page-a',
    status: 'running',
    startStage: 'analyze',
    nextStage: 'research',
    steps: [{ stage: 'analyze', status: 'succeeded' }],
  },
  steps: [
    {
      stage: 'analyze',
      status: 'succeeded',
      nodes: [keyword],
      provider: null,
      fallbackUsed: false,
    },
  ],
};

describe('generation canvas', () => {
  it('shows returned output and keeps subsequent stages as placeholders', () => {
    const { nodes } = buildCanvas([set], generation, labels, geometry);
    expect(nodes.find((node) => node.id === 'set-a:k1')?.data.text).toBe('Lamp');
    expect(nodes.find((node) => node.id === 'set-a:research-placeholder')?.data.state).toBe(
      'running',
    );
    expect(nodes.find((node) => node.id === 'set-a:evidence-placeholder')?.data.state).toBe(
      'pending',
    );
    expect(nodes.filter((node) => node.data.kind === 'heading')).toHaveLength(7);
  });
  it('preserves previous output when the next stage fails', () => {
    const { nodes } = buildCanvas(
      [set],
      { ...generation, error: { stage: 'research', message: 'Failed', retryable: true } },
      labels,
      geometry,
    );
    expect(nodes.find((node) => node.id === 'set-a:k1')?.data.state).toBe('done');
    expect(nodes.find((node) => node.id === 'set-a:research-placeholder')?.data.state).toBe(
      'failed',
    );
  });
  it('namespaces node ids and stacks sets without overlap', () => {
    const second = { ...set, id: 'set-b', position: 2 };
    const { nodes, edges } = buildCanvas([second, set], generation, labels, geometry);
    expect(new Set(nodes.map((node) => node.id)).size).toBe(nodes.length);
    expect(edges[0]?.source).toBe('set-a:prompt');
    const firstMax = Math.max(
      ...nodes.filter((node) => node.data.setId === set.id).map((node) => node.position.y),
    );
    const secondMin = Math.min(
      ...nodes.filter((node) => node.data.setId === second.id).map((node) => node.position.y),
    );
    expect(secondMin).toBeGreaterThan(firstMax + geometry.nodeHeight);
  });
  it('keeps nonvisual execution stages out of the five columns', () => {
    expect(visibleStage('assemble')).toBeNull();
    expect(visibleStage('image')).toBeNull();
    expect(visibleStage('verify')).toBe('verify');
  });
  it('moves between columns and keeps keyboard navigation inside its set', () => {
    const { nodes } = buildCanvas(
      [set, { ...set, id: 'set-b', position: 2 }],
      generation,
      labels,
      geometry,
    );
    expect(keyboardTarget(nodes, 'set-a:prompt', 'ArrowRight')?.id).toBe('set-a:k1');
    expect(keyboardTarget(nodes, 'set-a:prompt', 'ArrowLeft')).toBeUndefined();
    expect(keyboardTarget(nodes, 'set-a:k1', 'End')?.id).toBe('set-a:answer');
    expect(keyboardTarget(nodes, 'set-a:answer', 'Home')?.id).toBe('set-a:prompt');
  });
  it('routes image failures to the answer instead of the verification column', () => {
    const { nodes } = buildCanvas(
      [set],
      { ...generation, error: { stage: 'image', message: 'Failed', retryable: true } },
      labels,
      geometry,
    );
    expect(nodes.find((node) => node.id === 'set-a:answer')?.data.state).toBe('failed');
    expect(
      nodes.find((node) => node.id === 'set-a:verify-placeholder')?.data.error,
    ).toBeUndefined();
  });
});

it('does not update unchanged cards when a later stage changes', () => {
  const before = buildCanvas([set], generation, labels, geometry);
  const after = buildCanvas(
    [set],
    { ...generation, error: { stage: 'research', message: 'Failed', retryable: true } },
    labels,
    geometry,
  );
  const previous = before.nodes.find((node) => node.id === 'set-a:k1')!;
  const next = after.nodes.find((node) => node.id === 'set-a:k1')!;
  expect(sameCardData(previous.data, next.data)).toBe(true);
  // 출력 노드의 최소 높이는 CSS(카드 모양)가 정한다.
  expect(previous.style?.minHeight).toBeUndefined();
});

it('binds output nodes and read-only verification lists to the displayed answer ID', () => {
  const criterion: Node = {
    id: 'v1',
    kind: 'criterion',
    stage: 'verify',
    text: 'Criterion',
    enabled: true,
    parentIds: ['k1'],
  };
  const mismatch: Node = { ...criterion, id: 'm1', kind: 'mismatch', text: 'Mismatch' };
  const answer = {
    id: 'old-answer',
    setId: set.id,
    number: 1,
    status: 'accepted',
    imageUrl: '/old',
    nodes: { schemaVersion: 1, subjectTemplate: 'Lamp', nodes: [keyword] },
    verification: { status: 'skipped', criteria: [criterion], mismatches: [mismatch] },
  } as NonNullable<PromptSet['latestAnswer']>;
  const graph = buildCanvas([{ ...set, latestAnswer: answer }], undefined, labels, geometry);
  const outputs = graph.nodes.filter((node) => node.data.kind === 'output');
  expect(outputs.map((node) => node.data.output!.id)).toEqual(['k1', 'v1', 'm1']);
  expect(outputs.every((node) => node.data.answerId === 'old-answer')).toBe(true);
  expect(
    outputs.filter((node) => node.data.column === 5).every((node) => node.data.state === 'skipped'),
  ).toBe(true);
  expect(outputs.every((node) => node.data.onRetry === undefined)).toBe(true);
});

it('draws step pills, group labels and joins priority rows into one card', () => {
  const rows: Node[] = [1, 2, 3].map((n) => ({
    id: `s${n}`,
    kind: 'priority',
    stage: 'research',
    text: `Row ${n}`,
    enabled: true,
    parentIds: [],
    order: n,
  }));
  const { nodes, edges } = buildCanvas(
    [set],
    {
      ...generation,
      steps: [
        {
          stage: 'research',
          status: 'succeeded',
          nodes: [keyword, ...rows],
          provider: null,
          fallbackUsed: false,
        },
      ],
    },
    { ...labels, groups: { keywords: 'Keywords', priority: 'Search priority' } },
    geometry,
  );
  expect(nodes.filter((n) => n.data.variant === 'step')).toHaveLength(5);
  expect(nodes.filter((n) => n.data.variant === 'group').map((n) => n.data.label)).toEqual(
    expect.arrayContaining(['Keywords', 'Search priority']),
  );
  const positions = rows.map(
    (r) => nodes.find((n) => n.id === `set-a:${r.id}`)!.data.groupPosition,
  );
  expect(positions).toEqual(['first', 'middle', 'last']);
  expect(edges.some((e) => e.id === 'set-a:analyze-heading->research-heading')).toBe(true);
});
