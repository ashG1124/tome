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
  type GenerationView,
} from '../model';
import { CanvasCard } from './CanvasCard';
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

/** 편집 패널을 피해 화면을 줄일 때의 가장 작은 확대 비율. 이보다 작아야 하면 줄이지 않고 답변 카드만 옮긴다. */
const MIN_EDIT_ZOOM = 0.55;

const NODE_TYPES = { card: CanvasCard };
const EDGE_TYPES = {};

export interface GenerationCanvasProps {
  sets: readonly PromptSet[];
  generation?: GenerationView;
  labels: CanvasLabels;
  geometry: CanvasGeometry;
  /** 파생 프로젝트면 원작 답변 카드를 위에 더한다. */
  derivedFrom?: WorkspaceDerivedFrom;
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
    () => buildCanvas(sets, generation, labels, geometry, derivedFrom),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fontsReady 는 배치 재계산 신호다.
    [sets, generation, labels, geometry, derivedFrom, fontsReady],
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

  // 노드 편집 패널이 열리면 패널이 가리는 오른쪽 띠 밖으로 답변 카드(와 고른 노드)가 오게 화면을 옮긴다.
  const selectedKey = editor?.selected ? `${editor.selected.setId}:${editor.selected.nodeId}` : '';
  useEffect(() => {
    if (!selectedKey) return;
    const selection = editor?.selected;
    const panel = document.querySelector('.canvas-editor-panels');
    const { domNode, transform } = store.getState();
    if (!selection || !panel || !domNode) return;
    const answer = flow.getInternalNode(`${selection.setId}:answer`);
    const node = flow.getInternalNode(`${selection.setId}:${selection.nodeId}`);
    if (!answer || !node) return;
    const box = domNode.getBoundingClientRect();
    const margin = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--space-padding-8'),
    );
    const limit = panel.getBoundingClientRect().left - box.left - margin;
    const [tx, ty, zoom] = transform;
    const right =
      answer.internals.positionAbsolute.x + (answer.measured.width ?? geometry.answerWidth);
    const left = node.internals.positionAbsolute.x;
    let nextZoom = zoom;
    if ((right - left) * zoom > limit - 2 * margin) {
      const fit = (limit - 2 * margin) / (right - left);
      if (fit >= MIN_EDIT_ZOOM) nextZoom = fit;
    }
    // 답변 카드가 패널 밖에 있어야 하는 것이 먼저, 고른 노드가 화면 안에 있는 것이 그 다음이다.
    const maxX = limit - right * nextZoom;
    const minX = margin - left * nextZoom;
    const nextX = minX <= maxX ? Math.min(Math.max(tx, minX), maxX) : maxX;
    if (nextZoom === zoom && nextX === tx) return;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    void flow.setViewport({ x: nextX, y: ty, zoom: nextZoom }, { duration: calm ? 0 : 200 });
    // 선택 키가 바뀔 때만 한 번 맞춘다. 열려 있는 동안 사용자가 옮기는 화면은 건드리지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

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
    (id: string) => {
      const node = flow.getInternalNode(id);
      if (!node) return;
      setActive((previous) =>
        previous[node.data.setId] === id ? previous : { ...previous, [node.data.setId]: id },
      );
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
          elementsSelectable={false}
          deleteKeyCode={null}
          minZoom={0.2}
          maxZoom={1.5}
          panOnScroll
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
