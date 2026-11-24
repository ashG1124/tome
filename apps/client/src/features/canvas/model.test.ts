import { describe, expect, it } from 'vitest';
import type { Node, PromptSet, WorkspaceDerivedFrom } from '@tome/shared';
import { fakeDeletedOriginDerivedFrom } from '../../shared/api/fake/agora';
import {
  stackColumn,
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
  derive: {
    mine: 'My answer',
    origin: (name) => `${name}’s answer`,
    deletedOriginal: 'Deleted original',
  },
};
const geometry: CanvasGeometry = {
  nodeWidth: 300,
  nodeHeight: 62,
  answerWidth: 520,
  columnGap: 95,
  promptGap: 171,
  answerGap: 203,
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
    expect(nodes.filter((node) => node.data.kind === 'heading')).toHaveLength(6);
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
    expect(
      edges.some((e) => e.source === 'set-a:prompt' && e.target === 'set-a:analyze-heading'),
    ).toBe(true);
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

describe('derive columns', () => {
  const answer = (id: string) =>
    ({
      id,
      setId: set.id,
      number: 1,
      status: 'accepted',
      imageUrl: '/mine',
      nodes: { schemaVersion: 1, subjectTemplate: 'Lamp', nodes: [keyword, verifyNode] },
    }) as unknown as NonNullable<PromptSet['latestAnswer']>;
  const verifyNode: Node = {
    id: 'v1',
    stage: 'verify',
    kind: 'criterion',
    text: 'Keywords reflected',
    parentIds: ['k1'],
    enabled: true,
  };
  const withAnswer = { ...set, latestAnswer: answer('a1') };
  const open: WorkspaceDerivedFrom = {
    projectId: 'origin',
    title: 'City sneakers',
    creator: { id: 'c1', kind: 'seed', displayName: 'shina', bio: null, avatarUrl: null },
    answer: { id: 'o1', number: 6, imageUrl: '/origin', thumbUrl: '/origin-thumb' },
  };
  const build = (derivedFrom?: WorkspaceDerivedFrom) =>
    buildCanvas([withAnswer], undefined, labels, geometry, derivedFrom);
  const headings = (nodes: ReturnType<typeof build>['nodes']) =>
    nodes.filter((n) => n.id.endsWith('-heading') && n.data.column === 6).map((n) => n.data.label);

  it('puts the original answer above My answer and links both from the last step', () => {
    const { nodes, edges } = build(open);
    expect(headings(nodes)).toEqual(['shina’s answer', 'My answer']);
    const origin = nodes.find((n) => n.id === 'set-a:origin-answer')!;
    const mine = nodes.find((n) => n.id === 'set-a:answer')!;
    expect(origin.data).toMatchObject({ kind: 'origin', label: 'Answer 6', origin: open });
    expect(origin.draggable).toBe(false);
    expect(mine.position.y).toBeGreaterThan(origin.position.y + 1);
    // 시안 Derive: 내 답변은 원작 답변보다 179 오른쪽에 놓인다(1002 − 823)
    expect(mine.position.x).toBe(origin.position.x + 179);
    expect(edges.filter((e) => e.target === 'set-a:origin-answer').map((e) => e.source)).toEqual([
      'set-a:verify-heading',
    ]);
    expect(
      edges.some((e) => e.source === 'set-a:verify-heading' && e.target === 'set-a:answer'),
    ).toBe(true);
  });
  it('links from the last step card when the copied answer has no verification nodes yet', () => {
    const bare = {
      ...answer('a2'),
      nodes: { schemaVersion: 1, subjectTemplate: 'Lamp', nodes: [] },
    } as unknown as NonNullable<PromptSet['latestAnswer']>;
    const { edges } = buildCanvas(
      [{ ...set, latestAnswer: bare }],
      undefined,
      labels,
      geometry,
      open,
    );
    expect(edges.filter((e) => e.source === 'set-a:verify-heading').map((e) => e.target)).toEqual([
      'set-a:answer',
      'set-a:origin-answer',
    ]);
  });
  it('keeps the original card in the keyboard order, above My answer', () => {
    const { nodes } = build(open);
    const origin = nodes.find((n) => n.id === 'set-a:origin-answer')!;
    expect(keyboardTarget(nodes, origin.id, 'ArrowDown')?.id).toBe('set-a:answer');
    expect(keyboardTarget(nodes, 'set-a:answer', 'ArrowUp')?.id).toBe(origin.id);
    expect(keyboardTarget(nodes, origin.id, 'End')?.id).toBe('set-a:answer');
  });
  it('shows Deleted original in place of the card when the original is gone', () => {
    const { nodes, edges } = build(fakeDeletedOriginDerivedFrom());
    expect(headings(nodes)).toEqual(['My answer']);
    expect(nodes.find((n) => n.id === 'set-a:origin-answer')?.data.label).toBe('Deleted original');
    expect(edges.some((e) => e.target === 'set-a:origin-answer')).toBe(false);
  });
  it('keeps the creator heading and an empty slot when only the original answer is gone', () => {
    const { nodes } = build({ ...open, answer: null });
    expect(headings(nodes)).toEqual(['shina’s answer', 'My answer']);
    expect(nodes.find((n) => n.id === 'set-a:origin-answer')?.data.origin?.answer).toBeNull();
  });
  it('leaves an original project as a single answer column', () => {
    const { nodes } = build(undefined);
    // 내 작업 화면에는 답변 카드 위 머리글이 없다(시안 My work)
    expect(headings(nodes)).toEqual([]);
    expect(nodes.some((n) => n.id === 'set-a:origin-answer')).toBe(false);
    expect(nodes.find((n) => n.id === 'set-a:answer')?.data.row).toBe(0);
  });
});

describe('stackColumn (#215)', () => {
  it('측정 높이로 카드 20·묶음 사이 40·소제목 아래 29 간격을 다시 맞춘다', () => {
    const moved = stackColumn([
      { id: 'g1', y: 100, height: 21, kind: 'heading' },
      // 어림(61)보다 실제가 두 줄(88)이라 다음 카드가 겹쳐 있던 상황
      { id: 'a', y: 129, height: 88, kind: 'card' },
      { id: 'b', y: 210, height: 61, kind: 'card' },
      { id: 'g2', y: 311, height: 21, kind: 'heading' },
      { id: 'c', y: 340, height: 61, kind: 'card' },
    ]);
    expect(moved.get('a')).toBeUndefined();
    expect(moved.get('b')).toBe(129 + 88 + 20);
    expect(moved.get('g2')).toBe(237 + 61 + 40);
    expect(moved.get('c')).toBe(338 + 29);
  });
  it('이어 붙는 줄(우선순위·검증 기준) 사이는 0, 묶음 끝 줄 뒤는 카드 간격', () => {
    const moved = stackColumn([
      { id: 'r1', y: 0, height: 50, kind: 'card', row: true, groupPosition: 'first' },
      { id: 'r2', y: 60, height: 40, kind: 'card', row: true, groupPosition: 'last' },
      { id: 'x', y: 100, height: 61, kind: 'card' },
    ]);
    expect(moved.get('r2')).toBe(50);
    expect(moved.get('x')).toBe(50 + 40 + 20);
  });
  it('이미 규칙대로면 아무것도 옮기지 않는다', () => {
    expect(
      stackColumn([
        { id: 'a', y: 0, height: 61, kind: 'card' },
        { id: 'b', y: 81, height: 61, kind: 'card' },
      ]).size,
    ).toBe(0);
  });
});
