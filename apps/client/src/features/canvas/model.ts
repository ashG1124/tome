import type {
  Answer,
  Job,
  JobStage,
  JobStep,
  Node as OutputNode,
  NodeStage,
  PromptSet,
} from '@tome/shared';
import type { Edge, Node } from '@xyflow/react';

export const VISIBLE_STAGES = ['analyze', 'research', 'evidence', 'draft', 'verify'] as const;

export interface CanvasLabels {
  title: string;
  prompt: string;
  stages: Record<NodeStage, string>;
  answer: (number: number) => string;
  step: (number: number) => string;
  modelKnowledge: string;
  generating: string;
  pending: string;
  skipped: string;
  retry: string;
  failed: string;
  fit: string;
  zoomIn: string;
  zoomOut: string;
  instructions: string;
}

export interface CanvasGeometry {
  nodeWidth: number;
  nodeHeight: number;
  answerWidth: number;
  columnGap: number;
  rowGap: number;
  setGap: number;
  headerHeight: number;
}

export interface GenerationView {
  setId: string;
  job: Job;
  steps: JobStep[];
  error?: { stage: JobStage; message: string; retryable: boolean };
  onRetry?: () => Promise<void>;
}

export type CardData = {
  kind: 'heading' | 'prompt' | 'output' | 'placeholder' | 'answer';
  setId: string;
  column: number;
  row: number;
  label: string;
  text?: string;
  output?: OutputNode;
  answer?: Answer;
  state?: 'pending' | 'running' | 'done' | 'skipped' | 'failed';
  error?: GenerationView['error'];
  onRetry?: () => Promise<void>;
  labels: CanvasLabels;
};
export type CanvasNode = Node<CardData, 'card'>;

export function visibleStage(stage: JobStage): NodeStage | null {
  return VISIBLE_STAGES.includes(stage as NodeStage) ? (stage as NodeStage) : null;
}

export function buildCanvas(
  sets: readonly PromptSet[],
  generation: GenerationView | undefined,
  labels: CanvasLabels,
  geometry: CanvasGeometry,
) {
  const nodes: CanvasNode[] = [];
  const edges: Edge[] = [];
  let top = 0;
  const { nodeWidth, nodeHeight, columnGap, rowGap, setGap, headerHeight } = geometry;
  for (const set of [...sets].sort((a, b) => a.position - b.position)) {
    const current = generation?.setId === set.id ? generation : undefined;
    const answer =
      current?.steps.find((step) => step.answer)?.answer ?? set.latestAnswer ?? undefined;
    const outputs = new Map<string, OutputNode>();
    for (const node of answer?.nodes.nodes ?? []) outputs.set(node.id, node);
    for (const node of [
      ...(answer?.verification?.criteria ?? []),
      ...(answer?.verification?.mismatches ?? []),
    ])
      outputs.set(node.id, node);
    for (const step of current?.steps ?? []) {
      for (const node of step.nodes ?? []) outputs.set(node.id, node);
      for (const node of [
        ...(step.verification?.criteria ?? []),
        ...(step.verification?.mismatches ?? []),
      ])
        outputs.set(node.id, node);
    }
    const id = (suffix: string) => `${set.id}:${suffix}`;
    const add = (
      suffix: string,
      column: number,
      row: number,
      data: Omit<CardData, 'setId' | 'column' | 'row' | 'labels'>,
      heading = false,
    ) => {
      nodes.push({
        id: id(suffix),
        type: 'card',
        position: {
          x: column * (nodeWidth + columnGap),
          y: top + (heading ? 0 : headerHeight + row * (nodeHeight + rowGap)),
        },
        data: { ...data, setId: set.id, column, row, labels },
        style: {
          width: column === 6 ? geometry.answerWidth : nodeWidth,
          minHeight: heading ? undefined : nodeHeight,
        },
        draggable: !heading,
        selectable: false,
        focusable: false,
        deletable: false,
      });
    };
    add('prompt-heading', 0, -1, { kind: 'heading', label: labels.prompt }, true);
    add('prompt', 0, 0, { kind: 'prompt', label: labels.prompt, text: set.prompt, state: 'done' });
    let maxRows = 1;
    VISIBLE_STAGES.forEach((stage, index) => {
      const column = index + 1;
      add(
        `${stage}-heading`,
        column,
        -1,
        { kind: 'heading', label: labels.stages[stage], text: labels.step(column) },
        true,
      );
      const stageNodes = [...outputs.values()]
        .filter((node) => node.stage === stage)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const result = current?.steps.find((step) => step.stage === stage);
      const status =
        result?.status ?? current?.job.steps.find((step) => step.stage === stage)?.status;
      const error = current?.error?.stage === stage ? current.error : undefined;
      const state = error
        ? 'failed'
        : status === 'failed'
          ? 'failed'
          : status === 'skipped' ||
              (stage === 'verify' && answer?.verification?.status === 'skipped')
            ? 'skipped'
            : status === 'succeeded' || (answer && !current)
              ? 'done'
              : current?.job.nextStage === stage
                ? 'running'
                : 'pending';
      if (stageNodes.length === 0) {
        add(`${stage}-placeholder`, column, 0, {
          kind: 'placeholder',
          label: labels.stages[stage],
          state,
          error,
          onRetry: current?.onRetry,
        });
      } else {
        stageNodes.forEach((node, row) =>
          add(node.id, column, row, {
            kind: 'output',
            label: node.text,
            text: node.text,
            output: node,
            state,
            error: row === 0 ? error : undefined,
            onRetry: current?.onRetry,
          }),
        );
      }
      maxRows = Math.max(maxRows, stageNodes.length);
    });
    const imageError =
      current?.error && ['assemble', 'image'].includes(current.error.stage)
        ? current.error
        : undefined;
    const running = current && !['succeeded', 'failed', 'cancelled'].includes(current.job.status);
    const answerParents = [...outputs.values()].filter((node) => node.stage === 'verify');
    for (const parent of answerParents) {
      edges.push({
        id: id(`${parent.id}->answer`),
        source: id(parent.id),
        target: id('answer'),
        type: 'smoothstep',
        focusable: false,
        selectable: false,
        deletable: false,
      });
    }
    add(
      'answer-heading',
      6,
      -1,
      { kind: 'heading', label: labels.answer(answer?.number ?? 1) },
      true,
    );
    add('answer', 6, 0, {
      kind: 'answer',
      label: labels.answer(answer?.number ?? 1),
      answer,
      state: imageError ? 'failed' : answer ? 'done' : running ? 'running' : 'pending',
      error: imageError,
      onRetry: current?.onRetry,
    });
    for (const node of outputs.values()) {
      const parents = node.parentIds.length
        ? node.parentIds
        : node.stage === 'analyze'
          ? ['prompt']
          : [];
      for (const parent of parents) {
        if (parent !== 'prompt' && !outputs.has(parent)) continue;
        edges.push({
          id: id(`${parent}->${node.id}`),
          source: id(parent),
          target: id(node.id),
          type: 'smoothstep',
          focusable: false,
          selectable: false,
          deletable: false,
        });
      }
    }
    top += Math.max(maxRows * (nodeHeight + rowGap), geometry.answerWidth) + headerHeight + setGap;
  }
  return { nodes, edges };
}

export function keyboardTarget(
  nodes: CanvasNode[],
  currentId: string,
  key: string,
): CanvasNode | undefined {
  const current = nodes.find((node) => node.id === currentId);
  if (!current) return;
  const siblings = nodes.filter(
    (node) => node.data.setId === current.data.setId && node.data.kind !== 'heading',
  );
  const ordered = siblings.sort((a, b) => a.data.column - b.data.column || a.data.row - b.data.row);
  if (key === 'Home') return ordered[0];
  if (key === 'End') return ordered.at(-1);
  const { column, row } = current.data;
  if (key === 'ArrowUp' || key === 'ArrowDown')
    return siblings.find(
      (node) => node.data.column === column && node.data.row === row + (key === 'ArrowUp' ? -1 : 1),
    );
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const next = siblings.filter(
      (node) => node.data.column === column + (key === 'ArrowLeft' ? -1 : 1),
    );
    return next.find((node) => node.data.row === row) ?? next.at(-1);
  }
}

export function sameCardData(a: CardData, b: CardData): boolean {
  return (
    (Object.keys(a) as (keyof CardData)[]).every((key) => Object.is(a[key], b[key])) &&
    Object.keys(a).length === Object.keys(b).length
  );
}
