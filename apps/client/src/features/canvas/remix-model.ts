import { ConnectionSchema, type Connection } from '@tome/shared';

export interface CanvasRemixOptions {
  connectionsByAnswer: Record<string, Connection[]>;
  onApply: (answerId: string, connection: Connection) => Promise<void>;
  onDismiss: (answerId: string, connection: Connection) => Promise<void>;
}

export function connectionsForNode(
  remix: CanvasRemixOptions | undefined,
  answerId: string | undefined,
  nodeId: string | undefined,
): Connection[] {
  if (!remix || !answerId || !nodeId) return [];
  const seen = new Set<string>();
  return (remix.connectionsByAnswer[answerId] ?? []).flatMap((value) => {
    const parsed = ConnectionSchema.safeParse(value);
    if (
      !parsed.success ||
      parsed.data.nodeId !== nodeId ||
      parsed.data.status === 'dismissed' ||
      seen.has(parsed.data.id)
    )
      return [];
    seen.add(parsed.data.id);
    return [parsed.data];
  });
}
