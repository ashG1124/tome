import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useStoreApi,
  type Edge,
} from '@xyflow/react';
import type { CanvasRemixOptions } from '../remix-model';
import type { PromptSet, WorkspaceDerivedFrom } from '@tome/shared';
import {
  buildCanvas,
  keyboardTarget,
  STEP_PILL_TOP,
  sameCardData,
  type CanvasGeometry,
  type CanvasLabels,
  type CanvasNode,
  type DerivePreview,
  type GenerationView,
} from '../model';
import { CanvasCard } from './CanvasCard';
import { useOpenShift } from '../hooks/useOpenShift';
import { useMeasuredStack } from '../hooks/useMeasuredStack';
import {
  CanvasNavigation,
  type CanvasEditorConnection,
  type CanvasHistoryConnection,
} from '../navigation';

import '@xyflow/react/dist/style.css';
import '../canvas.css';

/** 토큰 값을 숫자로 읽는다. 스타일이 없는 환경(테스트 등)이면 NaN. */
function tokenNumber(name: string): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
}

/**
 * 첫 화면: 가장 최근 세트를 Figma 프레임(My work 3924:67090 / 파생 Derive 1679:15197)과 같은 자리에 놓는다.
 * 시안 1728 폭 기준 값(확대율·1단계 왼쪽·알약 위쪽)을 화면 폭에 비례해 늘리거나 줄인다(0.7~1.25배).
 * 맞는 노드가 없거나 토큰이 없으면 null.
 */
function recentView(
  nodes: readonly CanvasNode[],
  sets: readonly PromptSet[],
  width: number,
  height: number,
  derived: boolean,
) {
  const latest = [...sets].sort((a, b) => b.position - a.position)[0];
  if (!latest || width <= 0 || height <= 0) return null;
  const steps = nodes.filter(
    (node) =>
      node.data.setId === latest.id && node.data.kind === 'heading' && node.data.variant === 'step',
  );
  const anchor = steps.find((node) => node.data.column === (derived ? 5 : 1));
  if (!anchor) return null;
  const frame = tokenNumber('--canvas-figma-frame-width');
  const scale = Math.min(1.25, Math.max(0.7, width / frame));
  const zoom = (derived ? 1 : tokenNumber('--canvas-figma-view-zoom')) * scale;
  const left = derived
    ? tokenNumber('--canvas-figma-derive-step-left')
    : tokenNumber('--canvas-figma-view-left');
  const pill = derived
    ? tokenNumber('--canvas-figma-derive-pill-top')
    : tokenNumber('--canvas-figma-view-pill-top');
  if (![zoom, left, pill].every(Number.isFinite)) return null;
  return {
    zoom,
    x: left * scale - anchor.position.x * zoom,
    y: pill * scale - (anchor.position.y + STEP_PILL_TOP) * zoom,
  };
}

const NODE_TYPES = { card: CanvasCard };
/**
 * 노드는 끌 수 없게 했지만(nodesDraggable=false) 클릭은 받아야 한다. React Flow 는 끌기·선택·클릭 처리가 모두 없는 노드에
 * pointer-events:none 을 주므로, 빈 클릭 처리기를 둬 노드가 눌리게 한다(실제 처리는 카드 안 onClick).
 */
const KEEP_NODE_POINTER = () => {};
const EDGE_TYPES = {};

export interface GenerationCanvasProps {
  sets: readonly PromptSet[];
  generation?: GenerationView;
  labels: CanvasLabels;
  geometry: CanvasGeometry;
  /** 파생 프로젝트면 원작 답변 카드를 위에 더한다. */
  derivedFrom?: WorkspaceDerivedFrom;
  /** 파생 세트에서 노드를 고쳐 만드는 미리보기. 있으면 My answer 자리에 그린다(#229). */
  derivePreview?: DerivePreview;
  announcement?: string;
  editor?: CanvasEditorConnection;
  history?: CanvasHistoryConnection;
  remix?: CanvasRemixOptions;
  remixDisabled?: boolean;
}

function CanvasContent({
  sets,
  generation,
  labels,
  geometry,
  derivedFrom,
  derivePreview,
  announcement,
  editor,
  history,
  remix,
  remixDisabled,
}: GenerationCanvasProps) {
  // 글꼴이 늦게 도착하면 줄 수 어림이 달라지므로 다 받은 뒤 한 번 더 배치한다.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let active = true;
    void document.fonts?.ready.then(() => {
      if (active) setFontsReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  const graph = useMemo(
    () => buildCanvas(sets, generation, labels, geometry, derivedFrom, derivePreview),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fontsReady 는 배치 재계산 신호다.
    [sets, generation, labels, geometry, derivedFrom, derivePreview, fontsReady],
  );
  const flow = useReactFlow<CanvasNode, Edge>();
  const initialized = useNodesInitialized();
  const store = useStoreApi<CanvasNode, Edge>();
  const previousLayout = useRef(new Map<string, { x: number; y: number }>());
  const fitted = useRef(false);
  const [active, setActive] = useState<Record<string, string>>({});
  const activeIds = useMemo(() => {
    const next: Record<string, string> = {};
    for (const node of graph.nodes) {
      if (node.data.kind === 'heading') continue;
      const setId = node.data.setId;
      if (!next[setId]) next[setId] = node.id;
      if (active[setId] === node.id) next[setId] = node.id;
    }
    return next;
  }, [graph.nodes, active]);

  useEffect(() => {
    const previous = flow.getNodes();
    const nextIds = new Set(graph.nodes.map((node) => node.id));
    const previousIds = new Set(previous.map((node) => node.id));
    const added = graph.nodes.filter((node) => !previousIds.has(node.id));
    if (previous.some((node) => !nextIds.has(node.id)) || added.length) {
      flow.setNodes([...previous.filter((node) => nextIds.has(node.id)), ...added]);
    }
    for (const node of graph.nodes) {
      if (previousIds.has(node.id)) {
        const previousNode = previous.find((entry) => entry.id === node.id);
        if (previousNode && !sameCardData(previousNode.data, node.data)) {
          flow.updateNodeData(node.id, node.data, { replace: true });
        }
        const origin = previousLayout.current.get(node.id);
        const existing = flow.getNode(node.id);
        if (origin && existing && (origin.x !== node.position.x || origin.y !== node.position.y)) {
          flow.updateNode(node.id, {
            position: {
              x: existing.position.x + node.position.x - origin.x,
              y: existing.position.y + node.position.y - origin.y,
            },
          });
        }
      }
    }
    flow.setEdges(graph.edges);
    previousLayout.current = new Map(graph.nodes.map((node) => [node.id, node.position]));
  }, [graph, flow]);

  useEffect(() => {
    if (initialized && !fitted.current && graph.nodes.length) {
      fitted.current = true;
      const { width, height } = store.getState();
      const view = recentView(flow.getNodes(), sets, width, height, !!derivedFrom);
      if (view) void flow.setViewport(view);
      else void flow.fitView({ padding: 0.12, minZoom: 0.3, maxZoom: 0.8 });
    }
  }, [initialized, flow, store, sets, graph.nodes.length, derivedFrom]);

  // 노드를 제자리에서 펼치면 아래 노드를 밀어 내리고, 다 펼친 뒤 펼친 카드와 노드 도구가 화면 안에 오게 살짝 옮긴다.
  const openId = useOpenShift(editor?.selected);
  // 실제 높이로 단계 열을 다시 쌓아 노드 간격을 일정하게(#215). 펼친 동안은 쉰다.
  useMeasuredStack(openId);
  useEffect(() => {
    if (!openId) return;
    const css = getComputedStyle(document.documentElement);
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const wait = calm ? 0 : Number.parseFloat(css.getPropertyValue('--motion-expand')) || 0;
    const timer = window.setTimeout(() => {
      const node = flow.getInternalNode(openId);
      if (!node) return;
      const {
        width,
        height,
        transform: [tx, ty, zoom],
      } = store.getState();
      const margin = Number.parseFloat(css.getPropertyValue('--space-padding-8')) || 0;
      // 오른쪽 노드 도구(아이콘 24 + 안쪽 여백) 자리까지 화면 안에 둔다.
      const tool =
        Number.parseFloat(css.getPropertyValue('--canvas-node-open-gap')) +
        Number.parseFloat(css.getPropertyValue('--size-icon-menu-button'));
      const { x, y } = node.internals.positionAbsolute;
      const w = (node.measured.width ?? geometry.nodeWidth) + (tool || 0);
      const h = node.measured.height ?? geometry.nodeHeight;
      // 아래쪽은 프롬프트 바·프리뷰가 떠 있으니 화면 높이의 1/5 을 비워 둔다.
      const bottomSpace = height / 5;
      let nextX = tx;
      let nextY = ty;
      if (x * zoom + tx < margin) nextX = margin - x * zoom;
      else if ((x + w) * zoom + tx > width - margin) nextX = width - margin - (x + w) * zoom;
      if ((y + h) * zoom + ty > height - bottomSpace) nextY = height - bottomSpace - (y + h) * zoom;
      if (y * zoom + nextY < margin) nextY = margin - y * zoom;
      if (Math.abs(nextX - tx) < 1 && Math.abs(nextY - ty) < 1) return;
      void flow.setViewport({ x: nextX, y: nextY, zoom }, { duration: calm ? 0 : 280 });
    }, wait);
    return () => window.clearTimeout(timer);
  }, [openId, flow, store, geometry.nodeWidth, geometry.nodeHeight]);

  // 코멘트 창이 열리면 노드 · 노드 도구 · 창이 화면 안에 오게 살짝 옮긴다(#221). 좌표는 React Flow store 기준.
  const commentAnswer = history?.selectedComment?.answerId;
  const commentNode = history?.selectedComment?.nodeId;
  useEffect(() => {
    if (!commentAnswer || !commentNode) return;
    const frame = requestAnimationFrame(() => {
      const target = flow
        .getNodes()
        .find(
          (node) => node.data.answerId === commentAnswer && node.data.output?.id === commentNode,
        );
      const node = target ? flow.getInternalNode(target.id) : undefined;
      if (!target || !node) return;
      const css = getComputedStyle(document.documentElement);
      const read = (name: string) => Number.parseFloat(css.getPropertyValue(name)) || 0;
      const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const {
        width,
        height,
        transform: [tx, ty, zoom],
      } = store.getState();
      const margin = read('--space-padding-8');
      const { x, y } = node.internals.positionAbsolute;
      const w = node.measured.width ?? geometry.nodeWidth;
      const h = node.measured.height ?? geometry.nodeHeight;
      // 창은 캔버스 배율을 되돌려 화면 기준 크기로 그린다. 레이아웃 크기 ÷ 배율 = store 좌표 크기.
      const panel = document.querySelector<HTMLElement>(
        `[data-id="${CSS.escape(target.id)}"] .canvas-comments`,
      );
      const right =
        x +
        w +
        2 * read('--space-padding-4') +
        read('--size-node-tool') +
        (panel?.offsetWidth ?? read('--size-comment-panel-width')) / zoom;
      const bottom = y + Math.max(h, (panel?.offsetHeight ?? 0) / zoom);
      // 아래쪽은 프롬프트 바·프리뷰가 떠 있으니 화면 높이의 1/5 을 비워 둔다.
      const bottomSpace = height / 5;
      let nextX = tx;
      let nextY = ty;
      if (right * zoom + tx > width - margin) nextX = width - margin - right * zoom;
      if (x * zoom + nextX < margin) nextX = margin - x * zoom;
      if (bottom * zoom + ty > height - bottomSpace) nextY = height - bottomSpace - bottom * zoom;
      if (y * zoom + nextY < margin) nextY = margin - y * zoom;
      if (Math.abs(nextX - tx) < 1 && Math.abs(nextY - ty) < 1) return;
      void flow.setViewport({ x: nextX, y: nextY, zoom }, { duration: calm ? 0 : 280 });
    });
    return () => cancelAnimationFrame(frame);
  }, [commentAnswer, commentNode, flow, store, geometry.nodeWidth, geometry.nodeHeight]);

  // 키보드로도 확대·축소할 수 있게 한다(화면 버튼을 없앤 대신). 입력칸 안에서는 글자 입력이 먼저다.
  const zoomByKey = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === '+' || event.key === '=') void flow.zoomIn();
      else if (event.key === '-') void flow.zoomOut();
      else if (event.key === '0') void flow.fitView({ padding: 0.12 });
    },
    [flow],
  );

  const focus = useCallback(
    (id: string, reveal = true) => {
      const node = flow.getInternalNode(id);
      if (!node) return;
      setActive((previous) =>
        previous[node.data.setId] === id ? previous : { ...previous, [node.data.setId]: id },
      );
      if (!reveal) return;
      const {
        width,
        height,
        transform: [tx, ty, zoom],
      } = store.getState();
      const { x, y } = node.internals.positionAbsolute;
      const w = node.measured.width ?? geometry.nodeWidth;
      const h = node.measured.height ?? geometry.nodeHeight;
      if (
        x * zoom + tx < 0 ||
        y * zoom + ty < 0 ||
        (x + w) * zoom + tx > width ||
        (y + h) * zoom + ty > height
      ) {
        void flow.setCenter(x + w / 2, y + h / 2, { zoom });
      }
    },
    [flow, store, geometry.nodeWidth, geometry.nodeHeight],
  );
  const move = useCallback(
    (id: string, key: string) => {
      const target = keyboardTarget(flow.getNodes(), id, key);
      if (!target) return;
      const node = flow.getInternalNode(target.id);
      if (!node) return;
      focus(target.id);
      const { x, y } = node.internals.positionAbsolute;
      void flow.setCenter(
        x + (node.measured.width ?? geometry.nodeWidth) / 2,
        y + (node.measured.height ?? geometry.nodeHeight) / 2,
        { zoom: flow.getZoom() },
      );
      document
        .querySelector<HTMLElement>(`[data-canvas-card="${CSS.escape(target.id)}"]`)
        ?.focus({ preventScroll: true });
    },
    [flow, focus, geometry.nodeWidth, geometry.nodeHeight],
  );
  const navigation = useMemo(
    () => ({ active: activeIds, focus, move, editor, history, remix, remixDisabled }),
    [activeIds, focus, move, editor, history, remix, remixDisabled],
  );

  return (
    <CanvasNavigation.Provider value={navigation}>
      <div
        className="generation-canvas"
        data-editing={openId ? true : undefined}
        role="region"
        aria-label={labels.title}
        onKeyDown={zoomByKey}
      >
        <div className="canvas-sr-only" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>
        <ReactFlow<CanvasNode, Edge>
          defaultNodes={graph.nodes}
          defaultEdges={graph.edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          edgesFocusable={false}
          nodesFocusable={false}
          nodesConnectable={false}
          nodesDraggable={false}
          onNodeClick={KEEP_NODE_POINTER}
          elementsSelectable={false}
          deleteKeyCode={null}
          minZoom={0.2}
          maxZoom={1.5}
          panOnScroll
          onPaneClick={editor?.close}
          proOptions={{ hideAttribution: true }}
          ariaLabelConfig={{
            'node.a11yDescription.default': labels.instructions,
            'node.a11yDescription.keyboardDisabled': labels.instructions,
            'controls.zoomIn.ariaLabel': labels.zoomIn,
            'controls.zoomOut.ariaLabel': labels.zoomOut,
            'controls.fitView.ariaLabel': labels.fit,
          }}
        ></ReactFlow>
      </div>
    </CanvasNavigation.Provider>
  );
}

export function GenerationCanvas(props: GenerationCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasContent {...props} />
    </ReactFlowProvider>
  );
}
