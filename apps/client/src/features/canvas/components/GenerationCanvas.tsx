import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useStoreApi,
  type Edge,
} from '@xyflow/react';
import type { PromptSet } from '@tome/shared';
import {
  buildCanvas,
  keyboardTarget,
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

const NODE_TYPES = { card: CanvasCard };
const EDGE_TYPES = {};

export interface GenerationCanvasProps {
  sets: readonly PromptSet[];
  generation?: GenerationView;
  labels: CanvasLabels;
  geometry: CanvasGeometry;
  announcement?: string;
  editor?: CanvasEditorConnection;
  history?: CanvasHistoryConnection;
}

function CanvasContent({
  sets,
  generation,
  labels,
  geometry,
  announcement,
  editor,
  history,
}: GenerationCanvasProps) {
  const graph = useMemo(
    () => buildCanvas(sets, generation, labels, geometry),
    [sets, generation, labels, geometry],
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
      void flow.fitView({ padding: 0.12, minZoom: 0.3, maxZoom: 0.8 });
    }
  }, [initialized, flow, graph.nodes.length]);

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
    () => ({ active: activeIds, focus, move, editor, history }),
    [activeIds, focus, move, editor, history],
  );

  return (
    <CanvasNavigation.Provider value={navigation}>
      <div className="generation-canvas" role="region" aria-label={labels.title}>
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
          ariaLabelConfig={{
            'node.a11yDescription.default': labels.instructions,
            'node.a11yDescription.keyboardDisabled': labels.instructions,
            'controls.zoomIn.ariaLabel': labels.zoomIn,
            'controls.zoomOut.ariaLabel': labels.zoomOut,
            'controls.fitView.ariaLabel': labels.fit,
          }}
        >
          {sets.length > 0 ? (
            <Panel position="bottom-right">
              <div className="canvas-controls">
                <button
                  type="button"
                  aria-label={labels.zoomOut}
                  onClick={() => void flow.zoomOut()}
                >
                  −
                </button>
                <button type="button" onClick={() => void flow.fitView({ padding: 0.12 })}>
                  {labels.fit}
                </button>
                <button type="button" aria-label={labels.zoomIn} onClick={() => void flow.zoomIn()}>
                  +
                </button>
              </div>
            </Panel>
          ) : null}
        </ReactFlow>
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
