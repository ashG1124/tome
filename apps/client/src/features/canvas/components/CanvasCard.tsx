import { memo, useContext } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CanvasNode } from '../model';
import { CanvasNavigation } from '../navigation';
import { CanvasSurface } from './CanvasSurface';

export const CanvasCard = memo(function CanvasCard({ id, data }: NodeProps<CanvasNode>) {
  const navigation = useContext(CanvasNavigation);
  if (data.kind === 'heading')
    return (
      <div className="canvas-heading">
        {data.text ? <span>{data.text}</span> : null}
        <strong>{data.label}</strong>
      </div>
    );
  return (
    <>
      {data.kind !== 'prompt' ? (
        <Handle type="target" position={Position.Left} isConnectable={false} />
      ) : null}
      <CanvasSurface
        data={data}
        data-canvas-card={id}
        tabIndex={navigation.active[data.setId] === id ? 0 : -1}
        onFocus={() => navigation.focus(id)}
        onKeyDown={(event) => {
          if (
            event.target !== event.currentTarget ||
            !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          navigation.move(id, event.key);
        }}
      />
      {data.kind !== 'answer' ? (
        <Handle type="source" position={Position.Right} isConnectable={false} />
      ) : null}
    </>
  );
});
