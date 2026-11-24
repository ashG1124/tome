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
  /** 소제목 높이(21) + 카드까지의 간격(8). 시안 1679:11623 */
  groupLabel: 29,
  /** 같은 묶음의 카드 사이 */
  cardGap: 20,
  /** 이전 묶음 마지막 카드 아래 → 다음 소제목. 시안 묶음 사이 gap 40 */
  groupGap: 40,
  /** 한 줄 높이(18px × 1.5) */
  line: 27,
  /** 한 줄짜리 카드 높이: 한 줄 27 + 안쪽 위아래 16×2 + 테두리 1×2 */
  card: 61,
  /** 카드 좌우 안쪽 여백 */
  cardPadding: 16,
  /** 묶음 행(우선순위·검증 기준) 사이 간격과 맨 위·맨 아래 안쪽 여백 */
  rowGap: 12,
  rowEdge: 20,
  /** 카드 아래 작은 안내 한 줄(Not measured, 14px × 1.5). 5단계가 측정 전(skipped)이면 줄마다 붙는다. */
  note: 21,
  /** 답변 그림 비율 11:7(canvas.css .canvas-image-slot). 파생 2열에서 위 카드 높이를 어림해 아래 카드를 놓는 데 쓴다. */
  answerAspect: 340 / 520,
  /** 열 맨 위(손잡이)에서 답변 카드 맨 앞 장 위쪽까지. 시안 1679:11606(카드 06 y369 − 열 y164) */
  answerTop: 205,
  /** 파생: 열 맨 위에서 원작자 머리글까지(위로 88), 원작 카드 맨 앞 장까지(+4). 시안 1679:17831 */
  originHeading: -88,
  originTop: 4,
  /** 파생: 내 답변 머리글·카드까지. 시안 1720:100994 */
  mineHeading: 388,
  mineTop: 431,
  /** 파생: 내 답변이 원작 답변보다 오른쪽으로 더 가 있는 거리(1002 − 823) */
  mineShift: 179,
  /** 머리글 한 줄 높이(20px × 1.5) → 카드 위 12 */
  headingBox: 30,
} as const;

/** 열 맨 위(손잡이)에서 단계 알약 위쪽까지(손잡이 6 + 간격 12). 첫 화면 위치를 잡을 때 쓴다. */
export const STEP_PILL_TOP = LAYOUT.pillTop;

export interface CanvasGeometry {
  nodeWidth: number;
  nodeHeight: number;
  answerWidth: number;
  columnGap: number;
  /** 질문 노드 오른쪽 끝 → 1단계 왼쪽 끝 */
  promptGap: number;
  /** 5단계 오른쪽 끝 → 답변 카드 왼쪽 끝 */
  answerGap: number;
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
  const pitch = nodeWidth + columnGap;
  // 1~5단계는 한 칸(300 + 95)씩, 질문 노드는 1단계 왼쪽 171 밖, 답변 열은 5단계 오른쪽 203 밖이다.
  const columnX = (column: number) =>
    column === 0
      ? pitch - nodeWidth - geometry.promptGap
      : column <= VISIBLE_STAGES.length
        ? column * pitch
        : VISIBLE_STAGES.length * pitch + nodeWidth + geometry.answerGap;
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
        xOffset?: number;
      } = {},
    ) => {
      // 노드는 끌어서 옮기지 않는다(리드 결정 #197). 노드 위에서 끌면 캔버스가 움직인다.
      const { heading = false, y, minHeight, draggable = false, xOffset } = opts;
      nodes.push({
        id: id(suffix),
        type: 'card',
        position: {
          x: (xOffset ?? 0) + columnX(column),
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
          // 측정 전(skipped) 안내 줄만큼 높여야 검증 기준 줄끼리 겹치지 않는다(#212).
          const height =
            estimateHeight(node, groupPosition, nodeWidth) +
            (state === 'skipped' ? LAYOUT.note : 0);
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
    // 시안(My work 3924:67090)은 5단계 알약 오른쪽 점에서 답변 카드 왼쪽 점으로 곡선 하나만 긋는다.
    const lastHeading = id(`${VISIBLE_STAGES[VISIBLE_STAGES.length - 1]}-heading`);
    edges.push({
      id: id('verify-heading->answer'),
      source: lastHeading,
      target: id('answer'),
      type: 'default',
      focusable: false,
      selectable: false,
      deletable: false,
    });
    // 질문 노드에서 1단계 알약 왼쪽 점으로 가는 곡선(시안 1679:11666)
    edges.push({
      id: id('prompt->analyze-heading'),
      source: id('prompt'),
      target: id(`${VISIBLE_STAGES[0]}-heading`),
      type: 'default',
      focusable: false,
      selectable: false,
      deletable: false,
    });
    const answerHeading = derive ? derive.mine : labels.answer(answer?.number ?? 1);
    // 파생 2열: 위는 원작 답변(읽기 전용), 아래는 내 답변. 위치는 시안 Derive 1679:17831·1720:100994 그대로다.
    const originCardY = top + LAYOUT.originTop;
    const mineCardY = top + LAYOUT.mineTop;
    if (derive && derivedFrom) {
      const creator = derivedFrom.creator;
      const deleted = derivedFrom.title === null || creator === null;
      if (!deleted) {
        add(
          'origin-heading',
          6,
          -1,
          { kind: 'heading', variant: 'origin', label: derive.origin(creator.displayName) },
          { heading: true, y: top + LAYOUT.originHeading },
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
        { y: originCardY, minHeight: false, draggable: false },
      );
      if (!deleted)
        edges.push({
          id: id('verify-heading->origin-answer'),
          source: lastHeading,
          target: id('origin-answer'),
          type: 'default',
          className: 'canvas-edge--origin',
          focusable: false,
          selectable: false,
          deletable: false,
        });
    }
    // 내 작업 화면에는 답변 카드 위에 머리글이 없다(칩이 번호를 말한다). 파생에서만 "My answer"를 단다.
    if (derive)
      add(
        'answer-heading',
        6,
        -1,
        { kind: 'heading', variant: 'answer', label: answerHeading },
        { heading: true, y: top + LAYOUT.mineHeading, xOffset: LAYOUT.mineShift },
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
      derive ? { y: mineCardY, xOffset: LAYOUT.mineShift } : { y: top + LAYOUT.answerTop },
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
          className: 'canvas-edge--parent',
          focusable: false,
          selectable: false,
          deletable: false,
        });
      }
    }
    const answerBottom =
      (derive ? LAYOUT.mineTop : LAYOUT.answerTop) + geometry.answerWidth * LAYOUT.answerAspect;
    top += Math.max(columnBottom, answerBottom) + setGap;
    edges.push(...stepEdges);
    stepEdges.length = 0;
  }
  return { nodes, edges };
}

/** 측정 높이로 다시 쌓을 때 한 단계 열의 항목. 단계 알약은 넣지 않는다. */
export interface ColumnEntry {
  id: string;
  /** 지금 y(캔버스 좌표) */
  y: number;
  /** 측정한 높이 */
  height: number;
  /** 묶음 소제목이면 heading, 노드·자리 카드면 card */
  kind: 'heading' | 'card';
  /** 우선순위·검증 기준처럼 한 장 카드 안의 줄로 이어 붙는 카드 */
  row?: boolean;
  groupPosition?: GroupPosition;
}

/**
 * 한 단계 열을 실제 측정 높이로 다시 쌓는다(#215). 글자 수로 어림한 높이와 실제 높이가 달라 간격이 어긋나는 것을 바로잡는다.
 * 간격 규칙은 buildCanvas 와 같다: 같은 묶음 카드 사이 cardGap, 이어 붙는 줄 사이 0,
 * 앞 카드 아래 → 다음 소제목 groupGap, 소제목 위 → 그 묶음 첫 카드 groupLabel. 첫 항목은 제자리.
 * 반환값은 바뀌어야 하는 항목의 새 y.
 */
export function stackColumn(entries: readonly ColumnEntry[]): Map<string, number> {
  const ordered = [...entries].sort((a, b) => a.y - b.y);
  const next = new Map<string, number>();
  let previous: (ColumnEntry & { at: number }) | undefined;
  for (const entry of ordered) {
    let at = entry.y;
    if (previous) {
      if (entry.kind === 'heading') at = previous.at + previous.height + LAYOUT.groupGap;
      else if (previous.kind === 'heading') at = previous.at + LAYOUT.groupLabel;
      else {
        const joined =
          previous.row &&
          (previous.groupPosition === 'first' || previous.groupPosition === 'middle');
        at = previous.at + previous.height + (joined ? 0 : LAYOUT.cardGap);
      }
    }
    if (Math.abs(at - entry.y) > 0.5) next.set(entry.id, at);
    previous = { ...entry, at };
  }
  return next;
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
