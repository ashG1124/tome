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
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('button, input, [role="slider"]')
          )
            return;
          if (data.output && navigation.editor?.canOpen(data.setId, data.output.id))
            navigation.editor.open(data.setId, data.output.id);
        }}
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
      {data.output && navigation.editor?.canOpen(data.setId, data.output.id) ? (
        <button
          type="button"
          className="canvas-retry nodrag nopan nowheel"
          aria-expanded={
            navigation.editor.selected?.setId === data.setId &&
            navigation.editor.selected.nodeId === data.output.id
          }
          onClick={() => navigation.editor?.open(data.setId, data.output!.id)}
        >
          {navigation.editor.label}
        </button>
      ) : null}
      {data.kind !== 'answer' ? (
        <Handle type="source" position={Position.Right} isConnectable={false} />
      ) : null}
    </>
  );
});
