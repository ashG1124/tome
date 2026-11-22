import { DEFAULT_AXES, LIMITS, type Node, type NodeSnapshot, type Pad } from '@tome/shared';

export function canEditNode(node: Node): boolean {
  return ['keyword', 'dataType', 'priority', 'evidence', 'attribute'].includes(node.kind);
}

export function sameEditableValues(a: NodeSnapshot, b: NodeSnapshot): boolean {
  return (
    a.nodes.length === b.nodes.length &&
    a.nodes.every((node) => {
      const other = b.nodes.find((entry) => entry.id === node.id);
      if (!other || node.enabled !== other.enabled) return false;
      if (node.kind === 'priority' && node.order !== other.order) return false;
      if (
        (node.kind === 'keyword' || node.kind === 'attribute') &&
        nodeWeight(node) !== nodeWeight(other)
      )
        return false;
      return (
        node.kind !== 'keyword' ||
        (nodePad(node).x === nodePad(other).x && nodePad(node).y === nodePad(other).y)
      );
    })
  );
}

export function replaceEditedNode(snapshot: NodeSnapshot, edited: Node): NodeSnapshot {
  const original = snapshot.nodes.find((node) => node.id === edited.id);
  if (!original || !canEditNode(original)) return snapshot;
  const next = { ...original, enabled: edited.enabled };
  if (original.kind === 'keyword' || original.kind === 'attribute')
    next.weight = integer(nodeWeight(edited), LIMITS.WEIGHT_MIN, LIMITS.WEIGHT_MAX);
  if (original.kind === 'keyword') {
    const pad = nodePad(original);
    const input = nodePad(edited);
    const updated = {
      ...pad,
      x: integer(input.x, LIMITS.PAD_MIN, LIMITS.PAD_MAX),
      y: integer(input.y, LIMITS.PAD_MIN, LIMITS.PAD_MAX),
    };
    if (original.pad || updated.x !== pad.x || updated.y !== pad.y) next.pad = updated;
  }
  if (original.kind === 'priority') next.order = edited.order ?? original.order;
  return { ...snapshot, nodes: snapshot.nodes.map((node) => (node.id === next.id ? next : node)) };
}

export function reorderPriorities(
  snapshot: NodeSnapshot,
  source: string,
  target: string,
): NodeSnapshot {
  const priorities = snapshot.nodes
    .filter((node) => node.kind === 'priority')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const from = priorities.findIndex((node) => node.id === source);
  const to = priorities.findIndex((node) => node.id === target);
  if (from < 0 || to < 0 || from === to) return snapshot;
  const positions = priorities.map((node, index) => node.order ?? index);
  const preservePositions = new Set(positions).size === positions.length;
  const [moved] = priorities.splice(from, 1);
  priorities.splice(to, 0, moved!);
  const orders = new Map(
    priorities.map((node, index) => [node.id, preservePositions ? positions[index]! : index]),
  );
  return {
    ...snapshot,
    nodes: snapshot.nodes.map((node) =>
      orders.has(node.id) ? { ...node, order: orders.get(node.id)! } : node,
    ),
  };
}

function integer(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Expected a finite value');
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function weightForKey(value: number, key: string): number | undefined {
  const current = integer(value, LIMITS.WEIGHT_MIN, LIMITS.WEIGHT_MAX);
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return Math.max(LIMITS.WEIGHT_MIN, current - 1);
    case 'ArrowRight':
    case 'ArrowUp':
      return Math.min(LIMITS.WEIGHT_MAX, current + 1);
    case 'Home':
      return LIMITS.WEIGHT_MIN;
    case 'End':
      return LIMITS.WEIGHT_MAX;
    default:
      return undefined;
  }
}

export function padForKey(pad: Pad, key: string): Pad | undefined {
  const x = integer(pad.x, LIMITS.PAD_MIN, LIMITS.PAD_MAX);
  const y = integer(pad.y, LIMITS.PAD_MIN, LIMITS.PAD_MAX);
  switch (key) {
    case 'ArrowLeft':
      return { ...pad, x: Math.max(LIMITS.PAD_MIN, x - 1), y };
    case 'ArrowRight':
      return { ...pad, x: Math.min(LIMITS.PAD_MAX, x + 1), y };
    case 'ArrowUp':
      return { ...pad, x, y: Math.min(LIMITS.PAD_MAX, y + 1) };
    case 'ArrowDown':
      return { ...pad, x, y: Math.max(LIMITS.PAD_MIN, y - 1) };
    case 'Home':
      return { ...pad, x: 0, y: 0 };
    default:
      return undefined;
  }
}

export function padCoordinates(pad: Pad): [string, string] {
  return [
    `${pad.xAxis[pad.x < 0 ? 0 : 1]} ${Math.abs(pad.x)}`,
    `${pad.yAxis[pad.y < 0 ? 0 : 1]} ${Math.abs(pad.y)}`,
  ];
}

export function nodeWeight(node: Node): number {
  return node.weight ?? 5;
}

export function nodePad(node: Node): Pad {
  return node.pad
    ? structuredClone(node.pad)
    : {
        x: 0,
        y: 0,
        xAxis: [...DEFAULT_AXES.xAxis],
        yAxis: [...DEFAULT_AXES.yAxis],
      };
}

export function restoreNode(node: Node, original: Node): Node {
  if (node.id !== original.id || node.kind !== original.kind || node.stage !== original.stage) {
    throw new Error('Cannot restore a different node');
  }
  const restored = structuredClone(original);
  const initial = original.aiInitial;
  if (initial?.weight !== undefined) restored.weight = initial.weight;
  if (initial?.enabled !== undefined) restored.enabled = initial.enabled;
  if (initial?.order !== undefined) restored.order = initial.order;
  if (initial?.pad) restored.pad = { ...nodePad(original), ...initial.pad };
  return restored;
}
