import { describe, expect, it } from 'vitest';
import type { Node, PromptSet, WorkspaceDerivedFrom } from '@tome/shared';
import { fakeDeletedOriginDerivedFrom } from '../../shared/api/fake/agora';
import {
  stackColumn,
  buildCanvas,
  shownNumber,
  keyboardTarget,
  commentNodeId,
  promptHeight,
  visibleStage,
  sameCardData,
  viewableOrigin,
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
    // 단계 알약 5개. 프롬프트 노드는 이름표를 카드 안에 두어 소제목이 없다(#228, 시안 1192:65515).
    expect(nodes.filter((node) => node.data.kind === 'heading')).toHaveLength(5);
  });
  it('places the 400px prompt node 171 left of step 1 and below the pill (#228)', () => {
    const promptGeometry = { ...geometry, promptWidth: 400 };
    const { nodes } = buildCanvas([set], generation, labels, promptGeometry);
    const prompt = nodes.find((node) => node.id === 'set-a:prompt')!;
    const step1 = nodes.find((node) => node.id === 'set-a:analyze-heading')!;
    expect(prompt.style?.width).toBe(400);
    expect(prompt.style?.minHeight).toBeUndefined();
    expect(prompt.position.x + 400 + promptGeometry.promptGap).toBe(step1.position.x);
    // 시안 1679:11666: 프롬프트 노드 위쪽은 열 맨 위에서 166
    expect(prompt.position.y - step1.position.y).toBe(166);
    expect(nodes.some((node) => node.id === 'set-a:prompt-heading')).toBe(false);
  });
  it('falls back to the node width when the prompt width token is missing', () => {
    const { nodes } = buildCanvas([set], generation, labels, { ...geometry, promptWidth: NaN });
    expect(nodes.find((node) => node.id === 'set-a:prompt')?.style?.width).toBe(300);
  });
  it('keeps the next set below a long prompt node', () => {
    const long = { ...set, prompt: 'word '.repeat(90).trim() };
    const second = { ...set, id: 'set-b', position: 2 };
    const promptGeometry = { ...geometry, promptWidth: 400 };
    const { nodes } = buildCanvas([long, second], undefined, labels, promptGeometry);
    const prompt = nodes.find((node) => node.id === 'set-a:prompt')!;
    const nextTop = Math.min(
      ...nodes.filter((node) => node.data.setId === 'set-b').map((node) => node.position.y),
    );
    expect(nextTop).toBeGreaterThan(prompt.position.y + promptHeight(long.prompt, 400));
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

it('does not reserve a not-measured line for skipped criteria rows (#230)', () => {
  const criteria: Node[] = [1, 2].map((n) => ({
    id: `v${n}`,
    kind: 'criterion',
    stage: 'verify',
    text: 'Short',
    enabled: true,
    parentIds: [],
  }));
  const answer = {
    id: 'answer',
    setId: set.id,
    number: 1,
    status: 'accepted',
    imageUrl: '/a',
    nodes: { schemaVersion: 1, subjectTemplate: 'Lamp', nodes: [keyword] },
    verification: { status: 'skipped', criteria, mismatches: [] },
  } as unknown as NonNullable<PromptSet['latestAnswer']>;
  const y = (status: 'skipped' | 'done') => {
    const graph = buildCanvas(
      [{ ...set, latestAnswer: { ...answer, verification: { ...answer.verification!, status } } }],
      undefined,
      labels,
      geometry,
    );
    const at = (id: string) => graph.nodes.find((node) => node.data.output?.id === id)!.position.y;
    return at('v2') - at('v1');
  };
  expect(y('skipped') - y('done')).toBe(0);
});

it('marks only the prompt, step pills, group labels and answers as draggable (#230)', () => {
  const evidence: Node = {
    id: 'e1',
    stage: 'evidence',
    kind: 'evidence',
    text: 'Brass',
    enabled: true,
    parentIds: [],
  };
  const answer = {
    id: 'answer',
    setId: set.id,
    number: 1,
    status: 'accepted',
    imageUrl: '/a',
    nodes: { schemaVersion: 1, subjectTemplate: 'Lamp', nodes: [keyword, evidence] },
  } as unknown as NonNullable<PromptSet['latestAnswer']>;
  const { nodes } = buildCanvas(
    [{ ...set, latestAnswer: answer }],
    undefined,
    { ...labels, groups: { keywords: 'Keywords', evidence: 'Evidence' } },
    geometry,
  );
  const draggable = nodes
    .filter((node) => node.draggable !== false)
    .map((node) => node.id.replace('set-a:', ''))
    .sort();
  expect(draggable).toEqual(
    [
      'prompt',
      'answer',
      'analyze-heading',
      'research-heading',
      'evidence-heading',
      'draft-heading',
      'verify-heading',
      'analyze-group-0',
      'evidence-group-0',
    ].sort(),
  );
  // 카드와 그 위 소제목은 같은 묶음을 가진다
  const group = (id: string) => nodes.find((node) => node.id === `set-a:${id}`)!.data.group;
  expect(group('k1')).toBe('analyze-0');
  expect(group('analyze-group-0')).toBe('analyze-0');
  expect(group('e1')).toBe('evidence-0');
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
  // 묶음 첫 줄만 묶음 전체 id 를 갖는다(리믹스 표시는 묶음당 1개, #229)
  expect(rows.map((r) => nodes.find((n) => n.id === `set-a:${r.id}`)!.data.groupIds)).toEqual([
    ['s1', 's2', 's3'],
    undefined,
    undefined,
  ]);
  expect(nodes.find((n) => n.id === 'set-a:k1')!.data.groupIds).toBeUndefined();
  expect(edges.some((e) => e.id === 'set-a:analyze-heading->research-heading')).toBe(true);
  // 닫힌 묶음은 한 노드(#241): 다른 줄은 첫 줄을 가리키고, 첫 줄은 묶음 소제목을 안다.
  const row = (id: string) => nodes.find((n) => n.id === `set-a:${id}`)!.data;
  expect([row('s1').groupHead, row('s2').groupHead, row('s3').groupHead]).toEqual([
    undefined,
    'set-a:s1',
    'set-a:s1',
  ]);
  expect(row('s1').groupLabel).toBe('Search priority');
  expect(row('k1').groupHead).toBeUndefined();
  // 단계 알약 사이 선은 베지어(끌어도 꺾이지 않는다, #241). 프롬프트→1단계 곡선과 같은 종류다.
  const stepEdges = edges.filter((e) => /-heading->.*-heading$/.test(e.id));
  expect(stepEdges).toHaveLength(4);
  expect(new Set(stepEdges.map((e) => e.type))).toEqual(new Set(['default']));
  expect(edges.find((e) => e.id === 'set-a:prompt->analyze-heading')?.type).toBe('default');
  // 키보드는 묶음 첫 줄만 들른다. 다른 줄에서 움직여도 첫 줄 기준이다.
  expect(keyboardTarget(nodes, 'set-a:s1', 'ArrowDown')).toBeUndefined();
  expect(keyboardTarget(nodes, 'set-a:k1', 'ArrowRight')?.id).toBe('set-a:s1');
  expect(keyboardTarget(nodes, 'set-a:s3', 'ArrowUp')).toBeUndefined();
});

describe('commentNodeId (#241)', () => {
  const node = (id: string, kind: Node['kind'], stage: Node['stage'], order?: number): Node => ({
    id,
    kind,
    stage,
    text: id,
    enabled: true,
    parentIds: [],
    ...(order === undefined ? {} : { order }),
  });
  const nodes = [
    node('k1', 'keyword', 'analyze'),
    node('d1', 'dataType', 'research', 0),
    node('s2', 'priority', 'research', 2),
    node('s1', 'priority', 'research', 1),
    node('v1', 'criterion', 'verify'),
    node('v2', 'criterion', 'verify'),
    node('m1', 'mismatch', 'verify'),
  ];
  it('stores group comments on the first displayed row', () => {
    expect(commentNodeId(nodes, 's2')).toBe('s1');
    expect(commentNodeId(nodes, 's1')).toBe('s1');
    expect(commentNodeId(nodes, 'v2')).toBe('v1');
  });
  it('keeps single nodes and unknown ids as they are', () => {
    expect(commentNodeId(nodes, 'k1')).toBe('k1');
    expect(commentNodeId(nodes, 'm1')).toBe('m1');
    expect(commentNodeId(nodes, 'zz')).toBe('zz');
  });
});

describe('shownNumber (#235)', () => {
  it('subtracts the derive copy and never goes below 1', () => {
    expect(shownNumber(2, 1)).toBe(1);
    expect(shownNumber(5, 1)).toBe(4);
    expect(shownNumber(3)).toBe(3);
    expect(shownNumber(1, 1)).toBe(1);
  });
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
    // 원작 답변 카드도 혼자 끌어 옮길 수 있다(#230). 머리글은 혼자 끌리지 않고 카드를 따라간다.
    expect(origin.draggable).toBeUndefined();
    expect(nodes.find((n) => n.id === 'set-a:origin-heading')!.draggable).toBe(false);
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
  it('opens the original picture with the original title, never a gone original (#237)', () => {
    expect(viewableOrigin(open)).toEqual({ id: 'o1', imageUrl: '/origin', title: 'City sneakers' });
    expect(viewableOrigin({ ...open, answer: null })).toBeUndefined();
    expect(viewableOrigin(fakeDeletedOriginDerivedFrom())).toBeUndefined();
    expect(viewableOrigin({ ...open, creator: null })).toBeUndefined();
    expect(viewableOrigin(undefined)).toBeUndefined();
  });
  describe('active answer (#229)', () => {
    const summary = (id: string, number: number) => ({
      id,
      number,
      pinned: false,
      isSample: false,
      thumbUrl: `/${id}-thumb`,
      createdAt: `2026-11-25T00:00:0${number}.000Z`,
    });
    const copy = { ...answer('copy'), origin: 'derived_copy' } as NonNullable<
      PromptSet['latestAnswer']
    >;
    const derivedSet = (displayed: string, versions: number) => ({
      ...set,
      latestAnswer: displayed === 'copy' ? copy : { ...answer(displayed), number: 2 },
      answers: [
        summary('copy', 1),
        ...[2, 3, 4].slice(0, versions).map((n) => summary(`m${n}`, n)),
      ],
    });
    const nodeOf = (nodes: ReturnType<typeof build>['nodes'], suffix: string) =>
      nodes.find((n) => n.id === `set-a:${suffix}`);

    it('right after deriving: the original is active and there is no My answer yet', () => {
      const { nodes, edges } = buildCanvas(
        [derivedSet('copy', 0)],
        undefined,
        labels,
        geometry,
        open,
      );
      expect(headings(nodes)).toEqual(['shina’s answer']);
      expect(nodeOf(nodes, 'answer')).toBeUndefined();
      expect(nodeOf(nodes, 'origin-answer')!.data.inactive).toBeUndefined();
      expect(nodeOf(nodes, 'origin-heading')!.data.inactive).toBeUndefined();
      expect(edges.some((e) => e.target === 'set-a:answer')).toBe(false);
      // 원작으로 가는 선은 활성(주황, 기본 선)
      expect(edges.find((e) => e.target === 'set-a:origin-answer')?.className).toBeUndefined();
      // 노드는 원작 복사본(원작자의 노드)을 그대로 보이고 고칠 수 있다
      expect(nodeOf(nodes, 'k1')!.data.answerId).toBe('copy');
    });

    it('my applied version is active; the copy is left out of its versions', () => {
      const { nodes, edges } = buildCanvas(
        [derivedSet('m2', 1)],
        undefined,
        labels,
        geometry,
        open,
      );
      expect(nodeOf(nodes, 'answer')!.data).toMatchObject({
        kind: 'answer',
        hiddenVersionIds: ['copy'],
        // 원작 복사본(1번)을 빼고 내 첫 버전은 Answer 01 이다(#235)
        numberOffset: 1,
        label: labels.answer(1),
      });
      expect(nodeOf(nodes, 'answer')!.data.inactive).toBeUndefined();
      expect(nodeOf(nodes, 'origin-heading')!.data.inactive).toBe(true);
      expect(nodeOf(nodes, 'answer-heading')!.data.inactive).toBeUndefined();
      expect(nodeOf(nodes, 'origin-answer')!.data).toMatchObject({
        inactive: true,
        activateAnswerId: 'copy',
      });
      expect(edges.find((e) => e.target === 'set-a:answer')?.className).toBeUndefined();
    });

    it('going back to the original keeps My answer as an inactive card that switches back', () => {
      const { nodes, edges } = buildCanvas(
        [derivedSet('copy', 2)],
        undefined,
        labels,
        geometry,
        open,
      );
      expect(headings(nodes)).toEqual(['shina’s answer', 'My answer']);
      expect(nodeOf(nodes, 'origin-answer')!.data.inactive).toBeUndefined();
      expect(nodeOf(nodes, 'origin-heading')!.data.inactive).toBeUndefined();
      expect(nodeOf(nodes, 'answer-heading')!.data.inactive).toBe(true);
      expect(nodeOf(nodes, 'answer')!.data).toMatchObject({
        inactive: true,
        activateAnswerId: 'm3',
        // 3번 버전은 원작 복사본을 빼고 2번으로 보인다(#235)
        label: 'Answer 2',
        summary: expect.objectContaining({ id: 'm3', thumbUrl: '/m3-thumb' }),
      });
      expect(nodeOf(nodes, 'answer')!.data.answer).toBeUndefined();
      expect(edges.find((e) => e.target === 'set-a:answer')?.className).toBe('canvas-edge--origin');
    });

    it('lifts the My answer heading above stacked versions so it stays visible', () => {
      const heading = (displayed: string, versions: number) =>
        nodeOf(
          buildCanvas([derivedSet(displayed, versions)], undefined, labels, geometry, open).nodes,
          'answer-heading',
        )!.position.y;
      const flat = heading('m2', 1);
      // 뒤 장(한 장 25씩 올라옴) 위로 머리글 아래가 4 떨어지게 올린다: 1장 16, 2장 41
      expect(heading('m3', 2)).toBe(flat - 16);
      expect(heading('m4', 3)).toBe(flat - 41);
      // 2장이어도 원작 카드(위 4 + 높이 340) 아래에 있다
      const top = nodeOf(
        buildCanvas([derivedSet('m4', 3)], undefined, labels, geometry, open).nodes,
        'origin-answer',
      )!.position.y;
      expect(heading('m4', 3)).toBeGreaterThanOrEqual(top + 340);
    });
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
