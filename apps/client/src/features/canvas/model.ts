import type {
  Answer,
  Job,
  JobStage,
  JobStep,
  Node as OutputNode,
  NodeStage,
  PromptSet,
  WorkspaceDerivedFrom,
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
  /** 단계 안 그룹 소제목. 없으면 소제목을 그리지 않는다. */
  groups?: Partial<Record<GroupKey, string>>;
  /** 파생 워크스페이스 답변 카드 문구. 없으면 파생 2열을 그리지 않는다. */
  derive?: {
    mine: string;
    origin: (name: string) => string;
    deletedOriginal: string;
  };
}

/** 노드 열 안의 묶음. 같은 묶음끼리 소제목 아래에 모인다. */
export type GroupKey = 'keywords' | 'dataType' | 'priority' | 'evidence' | 'criteria' | 'mismatch';

/** 단계 이름표(알약)와 그룹 소제목은 노드 위에 얹는 장식 줄이다. */
export type HeadingVariant = 'step' | 'group' | 'answer' | 'origin';
/** 한 묶음 안 위치. 묶음 행(우선순위·검증 기준)을 한 장 카드처럼 이어 붙이는 데 쓴다. */
export type GroupPosition = 'first' | 'middle' | 'last' | 'only';

/**
 * 노드 열 안쪽 배치값(캔버스 좌표). 토큰에 없는 시안 실측값이라 여기에 모은다.
 * 시안: 단계 알약 1226:69439(손잡이 6 + 간격 12 + 알약 62), 키워드 카드 간격 20, 소제목 아래 7.
 */
const LAYOUT = {
  /** 손잡이(6) + 간격(12) */
  pillTop: 18,
  /** 알약 맨 위에서 첫 카드(또는 첫 소제목 아래 카드)까지 */
  firstCard: 128,
  /** 소제목 높이 + 카드까지의 간격 */
  groupLabel: 28,
  /** 같은 묶음의 카드 사이 */
  cardGap: 20,
  /** 이전 묶음 마지막 카드 아래 → 다음 소제목 */
  groupGap: 41,
  /** 한 줄 높이(18px × 1.5) */
  line: 27,
  /** 한 줄짜리 카드 높이 */
  card: 60,
  /** 카드 좌우 안쪽 여백 */
  cardPadding: 16,
  /** 묶음 행(우선순위·검증 기준) 사이 간격과 맨 위·맨 아래 안쪽 여백 */
  rowGap: 12,
  rowEdge: 20,
  /** 답변 그림 비율 11:7(canvas.css .canvas-image-slot). 파생 2열에서 위 카드 높이를 어림해 아래 카드를 놓는 데 쓴다. */
  answerAspect: 7 / 11,
} as const;

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
  kind: 'heading' | 'prompt' | 'output' | 'placeholder' | 'answer' | 'origin';
  variant?: HeadingVariant;
  groupPosition?: GroupPosition;
  setId: string;
  column: number;
  row: number;
  label: string;
  text?: string;
  output?: OutputNode;
  answer?: Answer;
  answerId?: string;
  /** 원작 답변 카드(kind 'origin')가 그릴 원작 정보. 읽기 전용이다. */
  origin?: WorkspaceDerivedFrom;
  state?: 'pending' | 'running' | 'done' | 'skipped' | 'failed';
  error?: GenerationView['error'];
  onRetry?: () => Promise<void>;
  labels: CanvasLabels;
};
export type CanvasNode = Node<CardData, 'card'>;

export function visibleStage(stage: JobStage): NodeStage | null {
  return VISIBLE_STAGES.includes(stage as NodeStage) ? (stage as NodeStage) : null;
}

function wrapLines(text: string, perLine: number): number {
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const length = Math.min(word.length, perLine);
    if (used === 0) used = length;
    else if (used + 1 + length <= perLine) used += 1 + length;
    else {
      lines += 1;
      used = length;
    }
  }
  return lines;
}

let measureContext: CanvasRenderingContext2D | null | undefined;
/** 실제 글꼴로 줄 수를 잰다. 캔버스를 못 쓰는 환경(테스트 등)에서는 undefined. */
function measureLines(text: string, width: number): number | undefined {
  if (typeof document === 'undefined' || /jsdom/i.test(navigator.userAgent)) return undefined;
  measureContext ??= document.createElement('canvas').getContext('2d');
  const context = measureContext;
  if (!context) return undefined;
  const style = getComputedStyle(document.body);
  const size = Number.parseFloat(style.getPropertyValue('--font-size-b2')) || 18;
  context.font = `${style.getPropertyValue('--font-weight-regular') || 400} ${size}px ${style.fontFamily}`;
  context.letterSpacing = `${-0.03 * size}px`;
  let lines = 1;
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= width) {
      line = candidate;
      continue;
    }
    if (line) lines += 1;
    // 한 줄보다 긴 낱말은 여러 줄로 쪼개진다(overflow-wrap: anywhere).
    lines += Math.max(0, Math.ceil(context.measureText(word).width / width) - 1);
    line = word;
  }
  return lines;
}

function groupOf(node: OutputNode): { key: string; label: GroupKey | string } {
  if (node.kind === 'keyword') return { key: 'keywords', label: 'keywords' };
  if (node.kind === 'dataType') return { key: 'dataType', label: 'dataType' };
  if (node.kind === 'priority') return { key: 'priority', label: 'priority' };
  if (node.kind === 'evidence') return { key: 'evidence', label: 'evidence' };
  if (node.kind === 'criterion') return { key: 'criteria', label: 'criteria' };
  if (node.kind === 'mismatch') return { key: 'mismatch', label: 'mismatch' };
  const category = node.category?.trim() ?? '';
  return { key: `category:${category}`, label: category };
}

const isRow = (node: OutputNode) => node.kind === 'priority' || node.kind === 'criterion';

/**
 * 글 줄 수로 카드 높이를 어림한다. 실제 글꼴로 재고(measureLines), 못 재면 글자 수로 센다.
 * 카드 안쪽 글 폭: 카드 폭 − 좌우 여백(16)·테두리(1) − 스위치(40)·아이콘(24)과 사이 간격(10).
 */
function estimateHeight(node: OutputNode, position: GroupPosition, nodeWidth: number): number {
  const inner = nodeWidth - 2 * (LAYOUT.cardPadding + 1);
  const side = node.kind === 'evidence' ? 40 : isRow(node) ? 24 : 0;
  const extra = node.kind === 'priority' ? 24 + 10 : 0;
  const width = inner - (side ? side + 10 : 0) - extra;
  const lines = measureLines(node.text, width) ?? wrapLines(node.text, Math.floor(width / 9));
  if (isRow(node)) {
    const edge = LAYOUT.rowEdge - LAYOUT.rowGap / 2;
    return (
      lines * LAYOUT.line +
      LAYOUT.rowGap +
      (position === 'first' || position === 'only' ? edge : 0) +
      (position === 'last' || position === 'only' ? edge : 0)
    );
  }
  return LAYOUT.card + (lines - 1) * LAYOUT.line;
}

function titleCase(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

export function buildCanvas(
  sets: readonly PromptSet[],
  generation: GenerationView | undefined,
  labels: CanvasLabels,
  geometry: CanvasGeometry,
  derivedFrom?: WorkspaceDerivedFrom,
) {
  const nodes: CanvasNode[] = [];
  const edges: Edge[] = [];
  const stepEdges: Edge[] = [];
  let top = 0;
  const { nodeWidth, nodeHeight, columnGap, rowGap, setGap, headerHeight } = geometry;
  const ordered = [...sets].sort((a, b) => a.position - b.position);
  for (const set of ordered) {
    // 파생 프로젝트의 원작 답변은 첫 세트(파생 때 원작 대표 답변이 복사된 세트) 옆에만 둔다.
    const derive = derivedFrom && labels.derive && set === ordered[0] ? labels.derive : undefined;
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
      opts: {
        heading?: boolean;
        y?: number;
        minHeight?: number | false;
        draggable?: boolean;
      } = {},
    ) => {
      const { heading = false, y, minHeight, draggable = !heading } = opts;
      nodes.push({
        id: id(suffix),
        type: 'card',
        position: {
          x: column * (nodeWidth + columnGap),
          y: y ?? top + (heading ? 0 : headerHeight + row * (nodeHeight + rowGap)),
        },
        data: { ...data, setId: set.id, column, row, labels },
        style: {
          width: column === 6 ? geometry.answerWidth : nodeWidth,
          minHeight: minHeight === false || heading ? undefined : (minHeight ?? nodeHeight),
        },
        draggable,
        selectable: false,
        focusable: false,
        deletable: false,
      });
    };
    add(
      'prompt-heading',
      0,
      -1,
      { kind: 'heading', variant: 'group', label: labels.prompt },
      { heading: true, y: top + LAYOUT.firstCard - LAYOUT.groupLabel },
    );
    add(
      'prompt',
      0,
      0,
      { kind: 'prompt', label: labels.prompt, text: set.prompt, state: 'done' },
      { y: top + LAYOUT.firstCard },
    );
    let columnBottom = nodeHeight;
    VISIBLE_STAGES.forEach((stage, index) => {
      const column = index + 1;
      add(
        `${stage}-heading`,
        column,
        -1,
        {
          kind: 'heading',
          variant: 'step',
          label: labels.stages[stage],
          text: labels.step(column),
        },
        { heading: true },
      );
      if (index > 0) {
        stepEdges.push({
          id: id(`${VISIBLE_STAGES[index - 1]}-heading->${stage}-heading`),
          source: id(`${VISIBLE_STAGES[index - 1]}-heading`),
          target: id(`${stage}-heading`),
          type: 'smoothstep',
          focusable: false,
          selectable: false,
          deletable: false,
        });
      }
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
      const firstY = top + LAYOUT.firstCard;
      if (stageNodes.length === 0) {
        add(
          `${stage}-placeholder`,
          column,
          0,
          {
            kind: 'placeholder',
            label: labels.stages[stage],
            state,
            error,
            onRetry: current?.onRetry,
          },
          { y: firstY },
        );
        columnBottom = Math.max(columnBottom, LAYOUT.firstCard + nodeHeight);
      } else {
        let cursor = firstY;
        let previousKey: string | undefined;
        stageNodes.forEach((node, row) => {
          const group = groupOf(node);
          const next = stageNodes[row + 1];
          const first = group.key !== previousKey;
          const last = !next || groupOf(next).key !== group.key;
          const groupPosition: GroupPosition =
            first && last ? 'only' : first ? 'first' : last ? 'last' : 'middle';
          if (first) {
            const text = labels.groups
              ? (labels.groups[group.label as GroupKey] ?? titleCase(group.label))
              : undefined;
            const gap = previousKey === undefined ? 0 : LAYOUT.groupGap + LAYOUT.groupLabel;
            if (previousKey !== undefined) cursor += gap - LAYOUT.cardGap;
            if (text && (labels.groups?.[group.label as GroupKey] || group.label)) {
              add(
                `${stage}-group-${row}`,
                column,
                row,
                { kind: 'heading', variant: 'group', label: text },
                { heading: true, y: cursor - LAYOUT.groupLabel },
              );
            }
          }
          add(
            node.id,
            column,
            row,
            {
              kind: 'output',
              label: node.text,
              text: node.text,
              output: node,
              groupPosition,
              answerId: answer?.status === 'accepted' ? answer.id : undefined,
              state,
              error: row === 0 ? error : undefined,
              onRetry: current?.onRetry,
            },
            { y: cursor, minHeight: false },
          );
          const height = estimateHeight(node, groupPosition, nodeWidth);
          cursor += height + (isRow(node) && !last ? 0 : LAYOUT.cardGap);
          previousKey = group.key;
        });
        columnBottom = Math.max(columnBottom, cursor - top);
      }
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
    const answerHeading = derive ? derive.mine : labels.answer(answer?.number ?? 1);
    // 파생 2열: 위는 원작 답변(읽기 전용), 아래는 내 답변. 아래 카드는 위 카드 높이만큼 내려 놓는다.
    const originHeight = geometry.answerWidth * LAYOUT.answerAspect;
    const mineHeadingY = top + headerHeight + originHeight + rowGap;
    if (derive && derivedFrom) {
      const creator = derivedFrom.creator;
      const deleted = derivedFrom.title === null || creator === null;
      if (!deleted) {
        add(
          'origin-heading',
          6,
          -1,
          { kind: 'heading', variant: 'origin', label: derive.origin(creator.displayName) },
          { heading: true, y: top },
        );
      }
      add(
        'origin-answer',
        6,
        0,
        {
          kind: 'origin',
          label: deleted
            ? derive.deletedOriginal
            : derivedFrom.answer
              ? labels.answer(derivedFrom.answer.number)
              : derive.origin(creator.displayName),
          origin: derivedFrom,
          state: 'done',
        },
        { y: top + headerHeight, minHeight: false, draggable: false },
      );
      // 마지막 단계에 노드가 아직 없으면(복사된 답변 등) 마지막 단계 자리 카드에서 두 답변 카드로 잇는다.
      const sources = answerParents.length
        ? answerParents.map((node) => node.id)
        : ['verify-placeholder'];
      for (const parent of sources) {
        if (!answerParents.length)
          edges.push({
            id: id(`${parent}->answer`),
            source: id(parent),
            target: id('answer'),
            type: 'smoothstep',
            focusable: false,
            selectable: false,
            deletable: false,
          });
        if (deleted) continue;
        edges.push({
          id: id(`${parent}->origin-answer`),
          source: id(parent),
          target: id('origin-answer'),
          type: 'smoothstep',
          className: 'canvas-edge--origin',
          focusable: false,
          selectable: false,
          deletable: false,
        });
      }
    }
    add(
      'answer-heading',
      6,
      -1,
      { kind: 'heading', variant: derive ? 'answer' : undefined, label: answerHeading },
      { heading: true, y: derive ? mineHeadingY : undefined },
    );
    add(
      'answer',
      6,
      derive ? 1 : 0,
      {
        kind: 'answer',
        label: labels.answer(answer?.number ?? 1),
        answer,
        state: imageError ? 'failed' : answer ? 'done' : running ? 'running' : 'pending',
        error: imageError,
        onRetry: current?.onRetry,
      },
      derive ? { y: mineHeadingY + headerHeight } : {},
    );
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
    const answerBottom = derive
      ? 2 * (headerHeight + originHeight) + rowGap
      : geometry.answerWidth + headerHeight;
    top += Math.max(columnBottom, answerBottom) + setGap;
    edges.push(...stepEdges);
    stepEdges.length = 0;
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
